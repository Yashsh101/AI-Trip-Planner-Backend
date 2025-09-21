const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

app.post('/api/generate-itinerary', async (req, res) => {
    try {
        const {
            destination,
            startDate,
            endDate,
            budget,
            travelers,
            accommodation,
            interests,
            specialRequests
        } = req.body;

        if (!destination || !startDate || !endDate || !budget) {
            return res.status(400).json({
                error: 'Missing required fields: destination, startDate, endDate, budget'
            });
        }

        console.log(`Generating itinerary for ${destination}...`);

        const weatherData = await getWeatherData(destination, startDate, endDate);
        
        const locationData = await getLocationData(destination);
        
        const placesData = await getPlacesOfInterest(destination, interests);
        
        const itinerary = await generateAIItinerary({
            destination,
            startDate,
            endDate,
            budget,
            travelers,
            accommodation,
            interests,
            specialRequests,
            weatherData,
            locationData,
            placesData
        });

        res.json({
            success: true,
            data: itinerary
        });

    } catch (error) {
        console.error('Error generating itinerary:', error);
        res.status(500).json({
            error: 'Failed to generate itinerary',
            message: error.message
        });
    }
});

async function getWeatherData(destination, startDate, endDate) {
    try {
        const geocodeUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(destination)}&limit=1&appid=${WEATHER_API_KEY}`;
        const geocodeResponse = await axios.get(geocodeUrl);
        
        if (geocodeResponse.data.length === 0) {
            throw new Error('Location not found');
        }

        const { lat, lon } = geocodeResponse.data[0];
        
        const currentWeatherUrl = `http://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`;
        const currentWeatherResponse = await axios.get(currentWeatherUrl);

        const forecastUrl = `http://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`;
        const forecastResponse = await axios.get(forecastUrl);

        return {
            current: currentWeatherResponse.data,
            forecast: forecastResponse.data,
            coordinates: { lat, lon }
        };
    } catch (error) {
        console.error('Weather API error:', error);
        // Return mock data if API fails
        return {
            current: {
                weather: [{ main: 'Clear', description: 'clear sky' }],
                main: { temp: 28, temp_min: 22, temp_max: 34 }
            },
            forecast: { list: [] },
            coordinates: { lat: 0, lon: 0 }
        };
    }
}

// Location data function using Google Maps API
async function getLocationData(destination) {
    try {
        const placesUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(destination)}&inputtype=textquery&fields=place_id,name,geometry,formatted_address,types&key=${GOOGLE_MAPS_API_KEY}`;
        
        const response = await axios.get(placesUrl);
        
        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0];
        }
        
        return null;
    } catch (error) {
        console.error('Google Maps API error:', error);
        return null;
    }
}

async function getPlacesOfInterest(destination, interests) {
    try {
        // First get the place_id for the destination
        const locationData = await getLocationData(destination);
        
        if (!locationData || !locationData.geometry) {
            return [];
        }

        const { lat, lng } = locationData.geometry.location;
        
        // Define interest types mapping
        const interestTypesMap = {
            heritage: ['museum', 'tourist_attraction', 'place_of_worship'],
            adventure: ['amusement_park', 'tourist_attraction', 'gym'],
            nightlife: ['night_club', 'bar'],
            food: ['restaurant', 'meal_takeaway', 'bakery'],
            nature: ['park', 'zoo', 'tourist_attraction'],
            relaxation: ['spa', 'beauty_salon', 'gym'],
            shopping: ['shopping_mall', 'store'],
            photography: ['tourist_attraction', 'museum', 'art_gallery']
        };

        const places = [];
        
        // Get places for each interest
        for (const interest of interests) {
            if (interestTypesMap[interest]) {
                for (const type of interestTypesMap[interest]) {
                    try {
                        const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=10000&type=${type}&key=${GOOGLE_MAPS_API_KEY}`;
                        
                        const response = await axios.get(placesUrl);
                        
                        if (response.data.results) {
                            const filteredPlaces = response.data.results
                                .filter(place => place.rating >= 4.0)
                                .slice(0, 3)
                                .map(place => ({
                                    ...place,
                                    interest_type: interest
                                }));
                            
                            places.push(...filteredPlaces);
                        }
                        
                        // Add delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (error) {
                        console.error(`Error fetching places for ${type}:`, error);
                    }
                }
            }
        }
        
        // Remove duplicates and return top rated places
        const uniquePlaces = places.filter((place, index, self) => 
            index === self.findIndex(p => p.place_id === place.place_id)
        );
        
        return uniquePlaces.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 20);
        
    } catch (error) {
        console.error('Places API error:', error);
        return [];
    }
}

async function generateAIItinerary(data) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        
        const startDate = new Date(data.startDate);
        const endDate = new Date(data.endDate);
        const tripDuration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        
        const weatherContext = data.weatherData.current ? 
            `Current weather: ${data.weatherData.current.weather[0].description}, Temperature: ${data.weatherData.current.main.temp}°C` :
            'Weather data unavailable';
        
        const placesContext = data.placesData.length > 0 ?
            `Available attractions: ${data.placesData.map(p => `${p.name} (${p.rating}/5 rating, ${p.interest_type} type)`).join(', ')}` :
            'Limited place data available';
        
        const budgetPerDay = Math.floor(data.budget / tripDuration);
        
        const prompt = `
        Create a detailed ${tripDuration}-day travel itinerary for ${data.destination}, India.
        
        Trip Details:
        - Destination: ${data.destination}
        - Duration: ${tripDuration} days (${data.startDate} to ${data.endDate})
        - Total Budget: ₹${data.budget} (approximately ₹${budgetPerDay} per day)
        - Number of travelers: ${data.travelers}
        - Accommodation preference: ${data.accommodation}
        - Interests: ${data.interests.join(', ')}
        - Special requests: ${data.specialRequests || 'None'}
        
        Context Information:
        - ${weatherContext}
        - ${placesContext}
        
        Please create a comprehensive itinerary that includes:
        1. Day-by-day activities with specific timings
        2. Recommended restaurants and local cuisine
        3. Transportation suggestions
        4. Cost estimates for each activity
        5. Accommodation recommendations
        6. Weather-appropriate activity suggestions
        7. Hidden gems and local experiences
        8. Cultural insights and tips
        9. When recommending places to eat at, visit or anything else, name those places too. 
        
        Format the response as a JSON object with the following structure:
        {
            "destination": "${data.destination}",
            "duration": ${tripDuration},
            "totalEstimatedCost": number,
            "weatherSummary": {
                "condition": "string",
                "temperature": "string",
                "recommendations": "string"
            },
            "dailyItinerary": [
                {
                    "day": number,
                    "date": "YYYY-MM-DD",
                    "theme": "string",
                    "activities": [
                        {
                            "time": "HH:MM AM/PM",
                            "activity": "string",
                            "location": "string",
                            "description": "string",
                            "estimatedCost": number,
                            "duration": "string",
                            "tips": "string"
                        }
                    ],
                    "meals": [
                        {
                            "type": "breakfast/lunch/dinner",
                            "restaurant": "string",
                            "cuisine": "string",
                            "estimatedCost": number,
                            "specialties": ["string"]
                        }
                    ],
                    "transportation": {
                        "mode": "string",
                        "estimatedCost": number,
                        "tips": "string"
                    }
                }
            ],
            "costBreakdown": {
                "accommodation": number,
                "transportation": number,
                "food": number,
                "activities": number,
                "miscellaneous": number
            },
            "accommodationRecommendations": [
                {
                    "name": "string",
                    "type": "string",
                    "priceRange": "string",
                    "features": ["string"],
                    "location": "string"
                }
            ],
            "localTips": [
                "string"
            ],
            "packingRecommendations": [
                "string"
            ]
        }
        
        Ensure all costs are realistic for ${data.destination}, India and stay within the total budget of ₹${data.budget}.
        Focus on ${data.interests.join(' and ')} activities as per user preferences.
        Consider the ${data.accommodation} accommodation preference for cost calculations.
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        console.log(text)
        
        try {
            const parsedItinerary = JSON.parse(text);
            return parsedItinerary;
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            return generateFallbackItinerary(data, tripDuration);
        }
        
    } catch (error) {
        console.error('AI generation error:', error);
        return generateFallbackItinerary(data, Math.ceil((new Date(data.endDate) - new Date(data.startDate)) / (1000 * 60 * 60 * 24)) + 1);
    }
}

function generateFallbackItinerary(data, tripDuration) {
    const budgetPerDay = Math.floor(data.budget / tripDuration);
    const accommodationCost = Math.floor(data.budget * 0.4);
    const transportationCost = Math.floor(data.budget * 0.2);
    const foodCost = Math.floor(data.budget * 0.25);
    const activitiesCost = Math.floor(data.budget * 0.15);
    
    const dailyItinerary = [];
    
    for (let day = 1; day <= tripDuration; day++) {
        const currentDate = new Date(data.startDate);
        currentDate.setDate(currentDate.getDate() + (day - 1));
        
        dailyItinerary.push({
            day: day,
            date: currentDate.toISOString().split('T')[0],
            theme: day === 1 ? "Arrival & Exploration" : 
                   day === tripDuration ? "Departure" : 
                   `${data.interests[0] || 'Sightseeing'} Day ${day - 1}`,
            activities: [
                {
                    time: day === 1 ? "10:00 AM" : "9:00 AM",
                    activity: day === 1 ? "Arrival and Check-in" : "Morning Exploration",
                    location: `${data.destination} City Center`,
                    description: day === 1 ? "Arrive at destination and settle into accommodation" : "Explore local attractions and landmarks",
                    estimatedCost: day === 1 ? 0 : Math.floor(budgetPerDay * 0.3),
                    duration: "2-3 hours",
                    tips: "Start early to make the most of your day"
                },
                {
                    time: "2:00 PM",
                    activity: `${data.interests.includes('heritage') ? 'Heritage Site Visit' : 'Local Attraction'}`,
                    location: `Popular ${data.interests[0] || 'Tourist'} Spot`,
                    description: `Experience the best of ${data.destination}'s ${data.interests[0] || 'attractions'}`,
                    estimatedCost: Math.floor(budgetPerDay * 0.2),
                    duration: "2-3 hours",
                    tips: "Book tickets online for better prices"
                },
                {
                    time: "7:00 PM",
                    activity: day === tripDuration ? "Departure Preparation" : "Evening Leisure",
                    location: day === tripDuration ? "Hotel" : "Local Market/Entertainment Area",
                    description: day === tripDuration ? "Pack and prepare for departure" : "Enjoy local nightlife and shopping",
                    estimatedCost: day === tripDuration ? 0 : Math.floor(budgetPerDay * 0.2),
                    duration: "2-3 hours",
                    tips: day === tripDuration ? "Check departure timings" : "Try local street food"
                }
            ],
            meals: [
                {
                    type: "breakfast",
                    restaurant: "Hotel/Local Café",
                    cuisine: "Continental/Indian",
                    estimatedCost: Math.floor(budgetPerDay * 0.1),
                    specialties: ["Local breakfast items", "Fresh fruits", "Tea/Coffee"]
                },
                {
                    type: "lunch",
                    restaurant: `${data.destination} Local Restaurant`,
                    cuisine: "Regional Indian",
                    estimatedCost: Math.floor(budgetPerDay * 0.15),
                    specialties: ["Regional specialties", "Vegetarian options", "Traditional dishes"]
                },
                {
                    type: "dinner",
                    restaurant: "Recommended Local Eatery",
                    cuisine: "Multi-cuisine",
                    estimatedCost: Math.floor(budgetPerDay * 0.2),
                    specialties: ["Local delicacies", "Popular dishes", "Desserts"]
                }
            ],
            transportation: {
                mode: "Local transport (Auto/Taxi/Bus)",
                estimatedCost: Math.floor(budgetPerDay * 0.15),
                tips: "Use ride-sharing apps for convenience and safety"
            }
        });
    }
    
    return {
        destination: data.destination,
        duration: tripDuration,
        totalEstimatedCost: Math.floor(data.budget * 0.9),
        weatherSummary: {
            condition: "Pleasant weather expected",
            temperature: "22-32°C",
            recommendations: "Carry light cotton clothing and a light jacket for evenings"
        },
        dailyItinerary: dailyItinerary,
        costBreakdown: {
            accommodation: accommodationCost,
            transportation: transportationCost,
            food: foodCost,
            activities: activitiesCost,
            miscellaneous: data.budget - accommodationCost - transportationCost - foodCost - activitiesCost
        },
        accommodationRecommendations: [
            {
                name: `${data.accommodation} Hotel in ${data.destination}`,
                type: data.accommodation,
                priceRange: data.accommodation === 'budget' ? "₹1000-2500/night" : 
                           data.accommodation === 'mid-range' ? "₹2500-6000/night" : "₹6000+/night",
                features: ["Clean rooms", "Good location", "Basic amenities", "WiFi"],
                location: "City center or tourist area"
            }
        ],
        localTips: [
            `Best time to visit ${data.destination} is during cooler hours`,
            "Carry cash as many local vendors don't accept cards",
            "Try local street food but choose busy stalls for freshness",
            "Negotiate prices at local markets",
            "Respect local customs and dress codes at religious places"
        ],
        packingRecommendations: [
            "Comfortable walking shoes",
            "Light cotton clothing",
            "Sunscreen and hat",
            "Camera for memories",
            "Portable charger",
            "First aid kit",
            "Water bottle"
        ]
    };
}

app.post('/api/book-itinerary', async (req, res) => {
    try {
        const { itineraryId, paymentDetails, userDetails } = req.body;
        
        console.log('Processing booking for itinerary:', itineraryId);
        console.log('User details:', userDetails);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const bookingConfirmation = {
            bookingId: `TRP${Date.now()}`,
            status: 'confirmed',
            confirmationNumber: `CONF${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            paymentStatus: 'completed',
            bookingDate: new Date().toISOString(),
            message: 'Your itinerary has been successfully booked!'
        };
        
        res.json({
            success: true,
            data: bookingConfirmation
        });
        
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({
            error: 'Booking failed',
            message: error.message
        });
    }
});

app.get('/api/popular-destinations', (req, res) => {
    const popularDestinations = [
        {
            name: 'Goa',
            image: '/api/placeholder/300/200',
            highlights: ['Beaches', 'Nightlife', 'Portuguese Heritage'],
            averageCost: '₹15,000-25,000'
        },
        {
            name: 'Rajasthan',
            image: '/api/placeholder/300/200',
            highlights: ['Royal Palaces', 'Desert Safari', 'Cultural Heritage'],
            averageCost: '₹20,000-35,000'
        },
        {
            name: 'Kerala',
            image: '/api/placeholder/300/200',
            highlights: ['Backwaters', 'Hill Stations', 'Ayurvedic Spas'],
            averageCost: '₹18,000-30,000'
        },
        {
            name: 'Himachal Pradesh',
            image: '/api/placeholder/300/200',
            highlights: ['Mountain Views', 'Adventure Sports', 'Hill Stations'],
            averageCost: '₹12,000-22,000'
        }
    ];
    
    res.json({
        success: true,
        data: popularDestinations
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'AI Trip Planner API is running'
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `Route ${req.originalUrl} not found`
    });
});

app.listen(PORT, () => {
    console.log(`AI Trip Planner API server running on port ${PORT}`);
    console.log(`API Base URL: http://localhost:${PORT}/api`);
    console.log(`Health Check: http://localhost:${PORT}/api/health`);
});

module.exports = app;