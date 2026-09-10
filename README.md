# AI-POWERED END-TO-END TRAVEL MANAGER

## 1. PROJECT OBJECTIVE

Build a full-stack web application called **Travel Manager** that manages a user's trip from the moment they start planning until they reach and explore their destination.

This should NOT be implemented as a simple chatbot that asks Gemini to "plan a trip."

The application should combine:

- User accounts
- MongoDB
- Structured travel datasets
- Gemini AI
- Google Maps APIs
- Leaflet
- OpenStreetMap
- Recommendation logic
- Geospatial distance calculations
- Itinerary optimization

The central idea is:

```text
User preferences
       ↓
Structured travel data
       ↓
Candidate selection
       ↓
Geographic optimization
       ↓
Gemini reasoning
       ↓
Validated itinerary
       ↓
Complete trip management
```

The application should feel like a real travel-management SaaS product rather than a basic CRUD college project.

---

# 2. AVAILABLE DATASETS

There are exactly three final datasets.

```text
data/
├── master_pois.csv
├── master_hotels.csv
└── master_restaurants.csv
```

There are no separate raw/cleaned/merged dataset folders.

These CSVs are the authoritative source datasets.

The application must inspect their actual schemas and must NOT invent columns that do not exist.

The datasets should be imported into MongoDB.

The original CSV files should remain untouched.

The import process may normalize data types, missing values and field names while storing the records in MongoDB.

The three primary MongoDB collections should be:

```text
pois
hotels
restaurants
```

---

# 3. DATA INGESTION

Create:

```text
scripts/importDatasets.js
```

This script should:

1. Read the three CSV files.
2. Inspect/parse their actual columns.
3. Convert appropriate values into proper MongoDB types.
4. Handle empty strings and missing values.
5. Handle invalid numeric values.
6. Normalize fields where necessary.
7. Avoid inventing missing information.
8. Insert records into MongoDB.
9. Provide useful import statistics.

Also create:

```text
scripts/createIndexes.js
```

which creates the required MongoDB indexes.

Because the restaurant dataset is large, the system must never load the entire restaurant collection into memory or send the entire dataset to Gemini.

Candidate filtering must happen before AI processing.

---

# 4. TECHNOLOGY STACK

## Frontend

Use:

- React
- Vite
- React Router
- Axios or fetch
- Leaflet
- React Leaflet
- OpenStreetMap tiles
- Responsive UI

## Backend

Use:

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT
- dotenv
- Gemini API/SDK

## External services

Only two external API ecosystems are required:

### Gemini

Used for:

- Trip reasoning
- Packing recommendations
- Weather interpretation/advice
- Transport recommendations
- POI ranking
- Hotel recommendations
- Restaurant recommendations
- Itinerary generation
- AI fallback suggestions
- Natural-language explanations

### Google Maps

Used for:

- Geocoding
- Location lookup
- Route calculation
- Distance/travel-time information
- Geographic support for itinerary planning

Leaflet + OpenStreetMap should be used for the frontend map visualization.

---

# 5. ENVIRONMENT VARIABLES

The project must use `.env`.

Required variables should include:

```env
MONGO_URI=
JWT_SECRET=
GEMINI_API_KEY=
GOOGLE_MAPS_API_KEY=
PORT=5000
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

Create `.env.example` containing the variable names but no real secrets.

Never expose MongoDB, JWT or Gemini secrets to the frontend.

The actual values will be supplied manually.

---

# 6. AUTHENTICATION

The application should support phone-based authentication.

There is no need for a real SMS provider at this stage.

Use a dummy OTP:

```text
123456
```

Registration should collect:

- Phone number
- Username
- Avatar

Potential future fields such as name/email can be supported but are not essential.

Flow:

```text
Register
   ↓
Phone number
   ↓
Username
   ↓
Avatar
   ↓
Send OTP
   ↓
Enter 123456
   ↓
Create user
   ↓
Generate JWT
   ↓
Dashboard
```

Login should use:

```text
Phone number
+
OTP
```

The dummy OTP implementation must be isolated in:

```text
server/src/services/auth/otp.service.js
```

so that a real OTP provider can be introduced later.

---

# 7. DASHBOARD

After login, the user reaches the main dashboard.

The dashboard should contain:

- Hero section
- Create Trip button
- My Trips
- Recent trips
- Explore destination CTA
- Public trip discovery

Each trip card should display useful information such as:

- Trip name
- Origin
- Destination
- Dates
- Duration
- Budget
- Transport preference
- Status
- Created date

Trips should be stored in MongoDB.

---

# 8. CREATE TRIP

The Create Trip page is one of the core features.

Collect:

### Basic information

- Trip name
- From/origin
- Destination
- Start date
- End date
- Budget

Number of days should preferably be calculated automatically from the start and end dates.

Example:

```text
Start: 12 October
End: 16 October

Duration = 5 days
```

Dates and duration must always remain internally consistent.

---

# 9. TRAVELLER PREFERENCES

The user should be able to select:

### Place interests

Examples:

- Historical
- Heritage
- Nature
- Adventure
- Beaches
- Mountains
- Wildlife
- Religious
- Cultural
- Museums
- Shopping
- Nightlife
- Photography
- Architecture
- Local experiences
- Entertainment
- Family-friendly
- Romantic

Allow multiple selections.

---

# 10. FOOD PREFERENCES

Allow multiple food preferences such as:

- Vegetarian
- Non-vegetarian
- Vegan
- Jain
- Local cuisine
- North Indian
- South Indian
- Chinese
- Continental
- Street food
- Fine dining
- Budget food
- No preference

These preferences should influence restaurant recommendations.

---

# 11. TRANSPORT PREFERENCE

The user chooses their preferred method of reaching the destination:

```text
Flight
Train
Bus
Car
Bike
Any
```

The application is NOT a booking platform.

It only displays travel options/recommendations.

Gemini is responsible for generating general transport recommendations because there is no dedicated live transport API in the current project.

For example, a flight recommendation may contain:

- Airline/type
- Approximate duration
- Departure/arrival concepts
- Estimated price if appropriate

But AI-generated transport information must never be represented as verified live availability.

Use labels such as:

```text
AI recommendation
Estimated
Not live availability
```

where appropriate.

---

# 12. OTHER TRIP PREFERENCES

Also support:

### Number of travellers

- Adults
- Children if required

### Trip type

- Solo
- Couple
- Family
- Friends
- Business

### Travel style

- Budget
- Moderate
- Luxury

### Pace

- Relaxed
- Balanced
- Packed

### Accommodation preference

- Hotel
- Hostel
- Resort
- Budget
- Luxury
- Any

### Daily travel tolerance

Optional maximum amount of local travel the user is comfortable with.

These values become part of the AI context.

---

# 13. COMPLETE TRIP GENERATION

When the user submits the trip form:

```text
POST /api/trips/generate
```

should initiate the complete generation pipeline.

The backend should:

1. Validate the request.
2. Store the basic trip information.
3. Determine/geocode the destination.
4. Find relevant POIs.
5. Find suitable hotels.
6. Find suitable restaurants.
7. Retrieve the required Google Maps geographic information.
8. Prepare transport context.
9. Prepare weather/trip-context information for Gemini.
10. Build a structured Gemini prompt.
11. Request a structured JSON response.
12. Validate Gemini's response.
13. Perform necessary enrichment/route calculations.
14. Save the final trip in MongoDB.
15. Return the generated trip to the frontend.

---

# 14. THREE PARTS OF THE GENERATED TRIP

Every generated trip should contain three major sections:

```text
1. PRE-TRIP
2. TRAVEL
3. DESTINATION ITINERARY
```

These should be visible as tabs/sections in the trip interface.

---

# 15. PRE-TRIP SECTION

The Pre-Trip section is responsible for preparing the traveller before departure.

Generate:

- Packing checklist
- Essentials
- Clothing recommendations
- Destination-specific items
- Practical travel tips
- Weather-related advice

There is no packing dataset.

Therefore this information is generated by Gemini.

Gemini should receive:

- Destination
- Dates
- Trip duration
- Traveller details
- Trip type
- Preferences
- Budget
- Available weather/travel context

The output should be structured.

Example:

```text
Essentials
- ID
- Phone charger
- Power bank
- Medicines

Clothing
- Comfortable clothes
- Weather-appropriate clothing

Destination-specific
- Umbrella
- Sunscreen
```

---

# 16. WEATHER

There is no dedicated weather API in this version.

Therefore weather-related information may be generated/estimated by Gemini.

However, the UI and prompts must make it clear that this is **AI-generated guidance**, not a verified meteorological forecast.

Do not present invented temperatures or precipitation as authoritative live weather.

The weather/context produced for a trip should be stored and reused while generating the itinerary.

Example reasoning:

```text
Rain likely according to AI context
        ↓
Favor indoor activities
        ↓
Place outdoor attractions in better time windows
```

---

# 17. TRAVEL SECTION

The second major section provides transportation recommendations from origin to destination.

The user-selected transport mode must influence the output.

Examples:

```text
Flight selected
→ Flight-oriented recommendations

Train selected
→ Train-oriented recommendations

Bus selected
→ Bus-oriented recommendations

Car selected
→ Driving route/travel recommendation
```

For car travel, Google Maps may provide distance and route information.

For other transport types, Gemini provides recommendations/estimates because no dedicated live transport APIs are being used.

Clearly label AI-generated/estimated information.

---

# 18. DATASET-BASED RECOMMENDATIONS

The application must NOT simply give Gemini the complete datasets.

Instead:

```text
User preferences
      ↓
MongoDB filtering
      ↓
Relevant candidate POIs
Relevant candidate hotels
Relevant candidate restaurants
      ↓
Geographic filtering/ranking
      ↓
Small candidate set
      ↓
Gemini
```

This is critical because the restaurant dataset is large.

Gemini should receive only the relevant records/candidates required for the current trip.

---

# 19. POI RECOMMENDATION

POIs should be selected using:

- Destination
- Category
- User interests
- Ratings
- Available metadata
- Budget where applicable
- Geographic proximity
- Weather suitability
- Trip duration

The system should rank candidates before sending them to Gemini.

Gemini should then use the candidate set to produce the personalized selection.

---

# 20. HOTEL RECOMMENDATION

Hotels should be selected based on:

- Destination
- Budget
- Travel style
- Rating
- Available hotel metadata
- Traveller preferences
- Geographic usefulness

The selected/recommended hotel can act as a base point for itinerary planning when appropriate.

If there is no actual hotel booking, clearly call it:

```text
Recommended accommodation
```

not a confirmed reservation.

---

# 21. RESTAURANT RECOMMENDATION

Restaurants should be recommended based on:

- Food preference
- Cuisine
- Budget
- Rating
- Destination/area
- Geographic proximity
- Time of day

Do not return a random list of restaurants.

Restaurants should be incorporated naturally into the itinerary:

```text
10:00 POI
12:30 Lunch nearby
14:00 POI
17:00 Cafe/snack
20:00 Dinner
```

---

# 22. MISSING DATA / GEMINI FALLBACK

Gemini should act as the fallback layer.

Example:

```text
Dataset has sufficient candidates
        ↓
Use dataset records

Dataset has insufficient candidates
        ↓
Ask Gemini for additional suggestions
        ↓
Mark them as AI-generated
```

Dataset-backed and AI-generated records must never be presented as though they came from the same source.

Each generated recommendation should ideally contain source metadata such as:

```text
source = dataset
```

or:

```text
source = gemini
```

---

# 23. POI GEOGRAPHIC OPTIMIZATION

This is a major feature of the project.

The system should not simply select the highest-rated places.

It should attempt to group nearby POIs together.

Example:

```text
POI A = North
POI B = South
POI C = North
POI D = East
```

Instead of:

```text
Day 1:
A → B → C → D
```

it should attempt:

```text
Day 1:
A → C

Day 2:
B → D
```

or a better arrangement based on the actual coordinates and constraints.

---

# 24. DISTANCE CALCULATIONS

Use Haversine distance for inexpensive geographic distance calculations:

```text
server/src/utils/haversine.js
```

Use Google Maps routing when actual road travel distance/time is required.

Keep:

```text
geographic distance
```

and:

```text
road travel distance/time
```

conceptually separate.

---

# 25. ITINERARY OPTIMIZATION

Create:

```text
server/src/services/itinerary/
```

containing:

```text
clustering.service.js
sequencing.service.js
itineraryOptimizer.service.js
```

Responsibilities:

### clustering.service.js

Group geographically related POIs.

### sequencing.service.js

Order POIs within each day.

### itineraryOptimizer.service.js

Combine:

- Distance
- Time
- User preferences
- Weather context
- Opening hours if reliable data exists
- Visit duration
- Daily limits
- Restaurant breaks
- Hotel/base location

The final route should be realistic.

---

# 26. GEMINI'S ROLE IN ITINERARY GENERATION

Gemini should receive structured context such as:

```json
{
  "trip": {},
  "preferences": {},
  "weather": {},
  "candidatePOIs": [],
  "candidateHotels": [],
  "candidateRestaurants": [],
  "transportOptions": []
}
```

The Gemini prompt should explicitly say:

- Return strict JSON.
- Prefer provided dataset candidates.
- Do not invent dataset IDs.
- Respect user preferences.
- Respect trip dates.
- Avoid excessive daily activity.
- Minimize unnecessary travel.
- Use weather context.
- Clearly identify AI-generated additions.
- Do not fabricate live transport availability.
- Do not treat unavailable information as verified facts.

---

# 27. GEMINI RESPONSE VALIDATION

Gemini's response must NEVER be blindly trusted.

Validate:

- JSON syntax
- Required fields
- Day numbers
- Dates
- Dataset IDs
- Coordinates
- Activity types
- Itinerary structure

If Gemini returns an invalid response:

```text
Retry
   ↓
If still invalid
   ↓
Fallback logic
```

The backend must remain functional even when Gemini fails.

---

# 28. ITINERARY STRUCTURE

Each day should contain:

```text
day
date
summary
weather/context
activities
```

Activities can include:

```text
POI
Restaurant
Hotel
Travel
Break
```

Example:

```json
{
  "day": 1,
  "date": "2026-10-12",
  "activities": [
    {
      "type": "poi",
      "name": "Example POI",
      "startTime": "10:00",
      "duration": 120
    },
    {
      "type": "restaurant",
      "name": "Example Restaurant",
      "startTime": "12:30"
    }
  ]
}
```

The exact schema can be refined during implementation.

---

# 29. EXPLORE PAGE

The Explore page is an independent discovery experience.

Use:

```text
Leaflet
+
OpenStreetMap
```

The page should show an interactive map centered around India initially.

The user can search for a destination such as:

```text
Mysuru
```

The application should:

```text
Search
 ↓
Google Maps geocoding
 ↓
Coordinates
 ↓
MongoDB nearby search
 ↓
POI / Hotel / Restaurant records
 ↓
Leaflet markers
```

---

# 30. EXPLORE MAP

Leaflet handles:

- Interactive map
- Zoom
- Pan
- Markers
- Popups
- Layers
- Visual itinerary routes

Leaflet is the frontend visualization library.

OpenStreetMap is the base map source.

Google Maps is used separately for geographic services such as geocoding/routing.

Do not confuse these responsibilities.

---

# 31. EXPLORE FILTERS

Provide filters such as:

```text
POIs
Hotels
Restaurants
```

and category/rating/price filters wherever the dataset supports them.

Clicking a marker should display:

- Name
- Category
- Rating
- Description
- Address/location
- Available metadata
- Source
- View details
- Add to trip where appropriate

---

# 32. HOTEL/RESTAURANT COORDINATES

The application must account for the fact that not every dataset entity necessarily has latitude/longitude.

POIs with coordinates can be directly used for map/geospatial operations.

For hotels/restaurants without coordinates:

```text
First filter by destination/city/area
        ↓
Select a small candidate set
        ↓
Geocode selected candidates only when required
        ↓
Use obtained coordinates for route/proximity logic
```

Never attempt to geocode the entire restaurant dataset during normal application usage.

---

# 33. PUBLIC TRIPS

Users can mark a trip:

```text
Private
Public
```

Private should be the default.

Only public trips should appear in:

```text
Public Trips
```

or the public portion of Explore.

Public trips may display:

- Trip name
- Destination
- Duration
- Budget
- Number of places
- Public username/avatar if appropriate

Private trips must remain protected.

---

# 34. MONGODB MODELS

Create models for:

```text
User
Trip
POI
Hotel
Restaurant
```

The main Trip document should contain:

```text
userId
tripName
origin
destination
startDate
endDate
numberOfDays
budget
travellers
transportPreference
placePreferences
foodPreferences
travelStyle
tripType
pace
accommodationPreference
preTrip
transport
itinerary
isPublic
createdAt
updatedAt
```

The exact fields should be adjusted to the actual implementation.

---

# 35. MONGODB GEOSPATIAL SUPPORT

Where coordinates are available, use GeoJSON:

```json
{
  "type": "Point",
  "coordinates": [longitude, latitude]
}
```

Create a MongoDB `2dsphere` index for geospatial queries.

This allows queries such as:

```text
Find POIs within X kilometres of Mysuru.
```

This is especially useful for the Explore page.

---

# 36. API ENDPOINTS

### Authentication

```text
POST /api/auth/register
POST /api/auth/send-otp
POST /api/auth/verify-otp
POST /api/auth/login
GET  /api/auth/me
```

### Trips

```text
POST   /api/trips
POST   /api/trips/generate
GET    /api/trips
GET    /api/trips/:id
PUT    /api/trips/:id
DELETE /api/trips/:id
```

### Explore

```text
GET /api/explore/search
GET /api/explore/pois
GET /api/explore/hotels
GET /api/explore/restaurants
GET /api/explore/nearby
```

### Public trips

```text
GET /api/public/trips
GET /api/public/trips/:id
```

### Maps

```text
GET  /api/maps/geocode
POST /api/maps/route
```

---

# 37. FRONTEND ROUTES

```text
/
```

Landing page

```text
/login
```

Login

```text
/register
```

Registration

```text
/verify-otp
```

OTP verification

```text
/dashboard
```

Dashboard

```text
/create-trip
```

Create trip

```text
/trip/:id
```

Trip details

```text
/trip/:id/pre-trip
```

Pre-trip

```text
/trip/:id/transport
```

Travel

```text
/trip/:id/itinerary
```

Itinerary

```text
/explore
```

Explore map

```text
/public-trips
```

Public trips

```text
/profile
```

Profile

---

# 38. FRONTEND TRIP EXPERIENCE

The Trip Details page should display:

```text
Trip name
Origin → Destination
Dates
Duration
Budget
```

Then:

```text
Overview
Pre-Trip
Travel
Itinerary
Map
```

The user should be able to move through the entire trip from this interface.

---

# 39. ITINERARY MAP

The itinerary map should show:

```text
Hotel/base
   ↓
POI
   ↓
Restaurant
   ↓
POI
   ↓
POI
```

For each day, display the relevant locations.

When possible, use Google Maps routing to obtain actual road route information.

Leaflet renders the result visually.

---

# 40. LOADING EXPERIENCE

Trip generation may require multiple operations.

Display a proper progress state such as:

```text
Creating your personalized journey...

✓ Reading your preferences
✓ Finding destinations
✓ Selecting places
✓ Finding accommodation
✓ Finding restaurants
✓ Preparing travel recommendations
✓ Analyzing weather context
⏳ Optimizing your itinerary
⏳ Finalizing your trip
```

Do not show a blank screen while generation is happening.

---

# 41. ERROR HANDLING

Every external dependency must have graceful error handling.

### Gemini failure

Use deterministic fallback logic.

### Google Maps failure

Use Haversine distance where possible and continue without route visualization.

### No dataset candidates

Use Gemini fallback suggestions.

### Invalid Gemini response

Retry, then fallback.

### MongoDB error

Return a user-friendly error.

Never display raw stack traces to users.

---

# 42. SECURITY

Implement:

- JWT authentication
- Protected routes
- User ownership validation
- Input validation
- API key protection
- CORS
- Rate limiting where appropriate
- Environment variables
- `.gitignore`

A user must never be able to read/update another user's private trip by modifying a URL.

---

# 43. DATA SOURCE TRANSPARENCY

Where possible, every recommendation should contain source information.

For example:

```text
Source: Dataset
```

or:

```text
Source: AI suggestion
```

or:

```text
Source: Google Maps
```

This is particularly important when Gemini supplements missing dataset information.

---

# 44. IMPORTANT RESPONSIBILITY SPLIT

Gemini is the **reasoning layer**, not the entire application.

### Gemini handles

```text
Personalization
Recommendation
Interpretation
Packing
Weather-related advice
Transport suggestions
Itinerary reasoning
Natural language
Fallback recommendations
```

### Backend handles

```text
Authentication
JWT
MongoDB
Dataset filtering
Data validation
Geospatial calculations
Date calculations
Trip persistence
API calls
Security
Gemini response validation
```

### Google Maps handles

```text
Geocoding
Routing
Travel distance
Travel duration
Geographic services
```

### Leaflet + OSM handles

```text
Map rendering
Markers
Popups
Map exploration
Itinerary visualization
```

This separation is critical.

---

# 45. CORE INTELLIGENCE PIPELINE

The final recommendation pipeline should be:

```text
USER
 ↓
Trip preferences
 ↓
MongoDB candidate retrieval
 ↓
POI / Hotel / Restaurant filtering
 ↓
Geographic filtering
 ↓
Candidate ranking
 ↓
Weather/travel context
 ↓
Gemini reasoning
 ↓
AI fallback if required
 ↓
Response validation
 ↓
Route optimization/enrichment
 ↓
MongoDB
 ↓
Frontend
```

This is much stronger than:

```text
User → Gemini → Trip
```

because the application contains actual recommendation and geospatial logic.

---

# 46. ACADEMIC / AIML COMPONENT

The project should be explainable as an intelligent recommendation system.

The AIML pipeline contains:

### Candidate generation

Find relevant places from the datasets.

### Candidate scoring

Consider:

- User preference match
- Rating
- Budget
- Distance
- Weather
- Other dataset information

### Geographic grouping

Group nearby places.

### Sequence optimization

Determine a practical order for the places within each day.

### Generative AI personalization

Gemini converts the structured candidates and constraints into an understandable personalized travel plan.

---

# 47. FALLBACK PHILOSOPHY

The system should continue functioning even if an external service fails.

Example:

```text
Gemini works
→ Personalized AI itinerary

Gemini fails
→ Dataset-based deterministic itinerary

Google Maps works
→ Route and travel time

Google Maps fails
→ Haversine distance
```

The user should still receive a useful trip instead of an application crash.

---

# 48. FUTURE FEATURES

The architecture should leave room for:

- Real OTP
- Live transport APIs
- Actual bookings
- Payments
- Reviews
- Collaborative trips
- Trip sharing
- Google Calendar integration
- Navigation integration
- AI trip modification
- Regenerate a single day
- Voice assistant

These are future extensions, not requirements for the initial version.

---

# 49. IMPLEMENTATION RULES

When generating the code:

1. Inspect the existing repository first.
2. Inspect all three CSV files and their actual columns.
3. Never invent dataset fields.
4. Do not modify the source CSVs unnecessarily.
5. Build MongoDB models around the actual dataset schema.
6. Build the dataset import script.
7. Build MongoDB indexes.
8. Implement authentication.
9. Implement dashboard.
10. Implement trip creation.
11. Implement deterministic candidate retrieval.
12. Implement geospatial support.
13. Implement Google Maps integration.
14. Implement Gemini integration.
15. Implement structured Gemini prompts.
16. Implement Gemini output validation.
17. Implement recommendation logic.
18. Implement itinerary clustering.
19. Implement itinerary sequencing.
20. Implement route/distance enrichment.
21. Implement trip persistence.
22. Implement Explore map.
23. Implement public trips.
24. Implement loading states.
25. Implement error handling.
26. Implement responsive UI.
27. Create `.env.example`.
28. Never hardcode API secrets.
29. Provide dataset import commands.
30. Provide complete setup instructions.

Do not leave core functionality as pseudocode.

The generated project should contain actual working code for all major components.

The final result should be a complete full-stack travel management application with a clear separation between:

```text
Data
Backend
AI
Maps
Recommendation
Optimization
Frontend
```

and should be structured so that individual external services can be replaced later without rewriting the entire application.
