# Trip Planning & Travel Companion App

## Product, UX, Functional & Integration Specification

## 1. Purpose

The application is a collaborative trip planning and travel companion app.

Users can create trips, invite other people, plan routes using geographic pins/stops, attach notes and structured information to each stop, track progress, manage trip items, access external trip resources, and use AI to ask questions about their trip.

The application already supports:

* User accounts/login
* Creating trips
* Inviting other users to trips

Do not rebuild or replace those existing capabilities unless necessary to support the functionality described below.

The new functionality should integrate naturally with the existing application.

The application should be designed around the concept of a **Trip Workspace**, where the map is the primary visual experience and all other trip information—stops, notes, items, documents, AI assistance, and progress—can be accessed from the trip.

---

# 2. Core Product Principles

## 2.1 Map-first experience

The map should be the central attraction and primary workspace of an active trip.

When a user opens a trip, the first experience should be:

```text
Trip
↓
Interactive Map
↓
Pins / Stops
↓
Route
↓
Trip controls
```

The user should not have to navigate through multiple screens to understand the trip geographically.

---

## 2.2 The map and list views are two representations of the same data

Every stop/pin should exist in both:

* Map view
* List/stop view

Changes made in one view should immediately appear in the other.

For example:

```text
Map
Pin 3 moved
      ↓
Stop list automatically updated
      ↓
Route automatically recalculated
```

And:

```text
Stop list
Pin 3 moved from position 5 → position 3
      ↓
Map route automatically recalculated
```

There should be one canonical trip/stop data model.

---

## 2.3 Auto-save

All meaningful trip changes should automatically save.

Users should not need to press a global "Save Trip" button.

Auto-save should apply to:

* Adding pins
* Removing pins
* Moving pins
* Reordering pins
* Editing notes
* Changing pin type
* Changing target date/time
* Marking a stop reached
* Editing metadata
* Adding or removing trip items
* Editing item categories
* Changing item colors
* Adding reference links

Show a subtle save state when appropriate:

```text
Saving...
Saved
Offline — will sync when connected
```

Avoid interrupting the user's workflow.

---

# 3. Existing Trips Experience

After login, users should see their existing trips.

The Trips page should display:

* Trip name
* Optional trip image/cover
* Start and destination, if defined
* Trip dates, if defined
* Number of stops
* Number of completed/reached stops
* Last updated timestamp
* Whether the user is owner or collaborator

Example:

```text
My Trips

┌─────────────────────────────┐
│ 🏔 Pacific Northwest Trip   │
│ Seattle → Banff             │
│ 12 stops · 4 reached        │
│ Updated 2 hours ago         │
└─────────────────────────────┘

┌─────────────────────────────┐
│ 🏕 Yellowstone Road Trip    │
│ 18 stops · 0 reached        │
│ Updated yesterday            │
└─────────────────────────────┘
```

Users should be able to:

* Tap a trip to open it
* Search/filter trips if they have many
* Create a new trip
* See trips shared with them
* Identify trips where they are an owner versus collaborator

Existing trip invitation functionality should remain intact.

---

# 4. Trip Details / Trip Workspace

When a user selects a trip, open the Trip Workspace.

The map should be the dominant element.

Recommended structure:

```text
┌─────────────────────────────────┐
│ Trip Name                 ⋮     │
├─────────────────────────────────┤
│                                 │
│                                 │
│             MAP                 │
│                                 │
│       📍                        │
│                📍               │
│           🚗                    │
│                     📍          │
│                                 │
├─────────────────────────────────┤
│ [Stops] [Items] [AI] [More]    │
├─────────────────────────────────┤
│ Next Stop                       │
│ Yellowstone Campground          │
│ 87 miles · ETA 4:30 PM         │
│                                 │
│ [Directions] [Reached]          │
└─────────────────────────────────┘
```

The exact layout can adapt to screen size.

On larger screens, use panels or split views where appropriate.

On mobile, use bottom sheets and overlays to preserve the map as the primary experience.

---

# 5. Initial Map State

When the user opens a trip:

### If the trip has pins

Automatically fit the map to show the relevant trip area and pins.

Preferably:

* Include all active pins if the trip is reasonably compact.
* If pins are geographically very far apart, prioritize the current route/current progress area rather than zooming out so far that the map becomes useless.

### If the trip has no pins

Show the user's current location if location permission is available.

If current location is unavailable:

* Show a sensible default map position.
* Provide a search control.

The map should never appear empty without an obvious way to search or add a location.

---

# 6. Map Interaction

Users should be able to:

* Pan/drag the map
* Zoom in/out
* Recenter on current location
* Fit map to trip
* Select pins
* Add pins
* Search the visible map area
* View the route
* View completed/reached route progress

Include a clear "My Location" control.

Include a "Fit Trip" or "Show Entire Route" control.

The map should not automatically recenter on the user every time their location changes.

Once the user manually drags the map, preserve their map position until they explicitly choose to recenter.

---

# 7. Adding a Pin by Long Press

The user should be able to add a pin by pressing and holding on the map.

Flow:

```text
Long press map
↓
Temporary pin appears
↓
Show location/address preview
↓
Show Add Stop action
```

Example:

```text
┌─────────────────────────────┐
│ Add Stop                    │
│                             │
│ 123 Main Street             │
│ Seattle, WA                 │
│                             │
│ [Add Stop]                  │
└─────────────────────────────┘
```

After adding:

* The pin becomes part of the trip.
* It should be assigned a default position/order.
* The route recalculates.
* The trip auto-saves.
* The user should be offered the opportunity to edit pin details.

The default behavior should place a newly added pin at the logical end of the route unless the user explicitly chooses another position.

---

# 8. Search and Add a Location

Provide a prominent search button.

Users should be able to search for:

* Addresses
* Businesses
* Parks
* Hotels
* Campgrounds
* Trailheads
* Attractions
* General locations

Search results should appear as a list and/or map markers.

Selecting a search result should show:

* Name
* Address
* Location
* Optional category/type
* Add as Stop button

The user should also be able to:

```text
Search
↓
Select location
↓
View on map
↓
Add as Stop
```

Do not automatically add search results as trip pins.

---

# 9. Search the Visible Map Area

Add a "Search this area" capability.

Example:

```text
User pans to new area
↓
Tap "Search this area"
↓
Search for:
Gas stations
Restaurants
Hotels
Campgrounds
EV chargers
```

The results should be geographically relevant to the currently visible map region.

The user should be able to add a result directly as a stop.

---

# 10. Pin / Stop Types

Every stop should have a `pinType`.

Initial types should include:

* General
* Stay
* Hotel
* Campground
* Hiking Trail
* Restaurant
* Attraction
* Gas Station
* EV Charger
* Airport
* Parking
* Other

The system should be extensible so additional types can be added later.

The pin type can influence:

* Icon
* Color
* Metadata fields
* External integrations
* AI context
* Nearby search suggestions

---

# 11. Pin Selection UX

Tapping a pin should open a bottom sheet or detail panel.

Example:

```text
Yellowstone Campground
Campground

July 26, 2026 · 4:00 PM

87 miles away

[Directions]
[Nearby]
[Edit]
[Reached]
[More]
```

The panel should provide contextual actions.

At minimum:

### Directions

Get directions to this selected pin.

The user should be able to choose:

```text
Current location → Selected pin
```

or:

```text
Previous stop → Selected pin
```

The route should not be permanently changed by simply requesting directions.

Directions are a temporary navigation action unless the user changes the trip's actual stop order.

---

### Nearby

Search for useful places near the selected pin.

Examples:

```text
Nearby

Gas
Restaurants
Hotels
Campgrounds
EV Chargers
Grocery
Pharmacy
Parking
```

Allow the user to add a result as a new trip stop.

---

### Edit

Open the stop editor.

---

### Remove

Remove the pin from the trip after confirmation.

Removing a pin must:

1. Remove it from the ordered stop list.
2. Remove it from the route.
3. Recalculate affected route segments.
4. Update total distance/time.
5. Update next-stop logic.
6. Auto-save.

Example:

```text
Before:

A → B → C → D

Remove B

After:

A → C → D
```

---

### Reached

Mark the stop as reached/completed.

---

# 12. Stop List View

The user should be able to switch from map view to a list of all stops.

Provide a prominent button:

```text
[Map] [Stops]
```

The Stops view should display:

```text
1. Seattle
   ✓ Reached

2. Missoula
   ✓ Reached

3. Yellowstone
   → Next

4. Grand Teton

5. Glacier
```

Each stop should show:

* Stop number
* Name
* Type
* Target date/time
* Completion status
* Optional distance
* Optional ETA

The list should support:

* Drag-and-drop reordering
* Add stop
* Edit stop
* Remove stop
* Mark reached
* Open on map

Reordering stops should immediately:

1. Update sequence.
2. Recalculate affected route segments.
3. Update ETAs.
4. Update next-stop logic.
5. Update map route.
6. Auto-save.

---

# 13. Route Visualization

The route should be visually distinct from ordinary map roads.

Use a prominent, thicker overlay line.

The route should be composed of segments:

```text
Start → Stop 1
Stop 1 → Stop 2
Stop 2 → Stop 3
Stop 3 → Destination
```

The route overlay should visually communicate progress.

Use the application's primary orange palette for the active/uncompleted route.

For example:

```text
Unreached route:
Orange

Completed/reached route:
A contrasting secondary color
```

The exact colors should be chosen to maintain accessibility and sufficient contrast in both light and dark themes.

The completed route should represent the portion of the trip that has already been reached.

Example:

```text
Start
  ╲
   ╲  COMPLETED ROUTE
    ╲
     📍 Stop 1 ✓
       ╲
        ╲  ACTIVE ROUTE
         📍 Stop 2 →
           ╲
            📍 Stop 3
```

When a stop is marked reached:

* The relevant route segment changes to the completed color.
* The next route segment becomes active.
* The next stop is updated.

If the user manually marks a stop as reached out of order, the application should handle this gracefully and preserve the actual stop completion state.

---

# 14. Pin Reordering and Route Logic

The ordered stops are the source of truth for route planning.

Example:

```text
A → B → C → D
```

If the user changes the order:

```text
A → C → B → D
```

The application must:

* Update stop sequence.
* Recalculate affected route segments.
* Update route geometry.
* Update distances.
* Update ETAs.
* Update next stop.
* Update map visualization.
* Auto-save.

Do not require the user to manually press "Recalculate Route."

---

# 15. Stop Editor

Each stop should have an editor.

Common fields:

```text
Stop Name
Pin Type
Notes
Target Date
Target Time
Address
Tags
```

The user should be able to add a target date/time.

This should initially be treated as a **planning target**, not necessarily a strict reservation.

Example:

```text
Target Arrival

July 26
4:00 PM
```

The target should be visible in the stop list and stop details.

The application can later calculate:

```text
Expected arrival
Target arrival
Actual arrival
```

These should be distinct concepts.

---

# 16. Stop-Type-Specific Metadata

The stop editor should dynamically display fields based on `pinType`.

## Stay / Hotel

Allow:

* Hotel name
* Reservation/reference number
* Check-in date/time
* Check-out date/time
* Confirmation number
* Address
* Notes
* Phone
* Website

---

## Campground

Allow:

* Campground name
* Reservation/reference number
* Site number
* Check-in
* Check-out
* Confirmation number
* Notes
* Phone
* Website

---

## Hiking Trail

Integrate with a hiking/trail information provider such as AllTrails or another appropriate provider, subject to API availability and licensing.

When `pinType = Hiking Trail`, allow the user to associate the stop with an external trail.

Potential information:

* Trail name
* Trail length
* Elevation gain
* Difficulty
* Estimated duration
* Trail URL
* Trail provider ID

Do not scrape third-party websites in violation of their terms.

If an official API is unavailable, support storing an external trail URL/reference instead.

The integration should be provider-abstracted so another hiking provider can be substituted.

---

# 17. Directions

When viewing a stop, provide:

```text
Directions
```

Allow:

```text
Current Location → Stop
```

or:

```text
Previous Stop → Stop
```

The first option should use the user's current location.

The second option should use the geographic coordinates of the previous stop.

The application itself should not need to implement turn-by-turn navigation.

When appropriate, open the user's preferred external navigation application.

Support, where practical:

* Google Maps
* Apple Maps
* Other installed navigation applications

The trip app remains responsible for trip planning and stop management.

The external navigation application handles turn-by-turn navigation.

---

# 18. Trip Items / Packing / Checklist

Each trip should have an Item List.

The user should be able to create arbitrary categories.

Examples:

```text
Camping

Tent
Sleeping bag
Camp stove

Food

Water
Coffee
Snacks

Car

Jumper cables
Tire inflator

Documents

Passport
Reservations
Insurance
```

Users should be able to:

* Create categories
* Rename categories
* Delete categories
* Reorder categories
* Add items
* Edit items
* Mark items complete
* Delete items
* Move items between categories

The user should control the categories.

Do not hard-code the category system.

---

# 19. Item Color Coding

Each item should optionally have a color.

Example:

```text
Camping
🟠 Tent
🔵 Sleeping bag
🟢 Camp stove
```

Color should be optional.

The user should be able to select from an accessible predefined palette.

Avoid relying solely on color to communicate item state.

Completed items should also have a visual completion indicator such as:

* Checkbox
* Strikethrough
* Reduced opacity

The user should be able to view:

```text
All Items
By Category
Incomplete
Completed
```

---

# 20. Google Sheets Reference

Allow a trip to have an external Google Sheets reference.

Trip Details should include:

```text
Reference Documents

📊 Trip Planning Sheet
[Open Google Sheet]
```

The sheet should be stored as a reference link associated with the trip.

The app should not necessarily copy the entire sheet into the application.

The user should be able to:

* Add a Google Sheets URL
* Give it a friendly name
* Edit the reference
* Remove the reference
* Open the sheet

If multiple reference links are eventually supported, use a generic external-reference model.

Possible future references:

* Google Sheets
* Google Docs
* Google Drive
* Reservation pages
* Trail pages

---

# 21. AI Trip Assistant

Integrate an AI assistant into the Trip Workspace.

The user should have access to an AI assistant that understands the current trip.

Example:

```text
Ask about this trip...

"What campground am I staying at after Yellowstone?"

"How many hiking stops are on this trip?"

"What are my notes for the next stop?"

"Where am I supposed to be on July 27?"

"Which stops have reservations?"

"How many miles are left?"

"Which stops are still incomplete?"
```

The AI assistant should receive relevant trip context.

The context may include:

* Trip name
* Start
* Destination
* Trip dates
* Ordered stops
* Pin types
* Coordinates
* Target arrival dates/times
* Notes
* Metadata
* Completion status
* Route distances
* Remaining distance
* Trip items
* Categories
* External references
* Relevant linked information, when available

Do not blindly send unnecessary user data.

Only provide the AI with information necessary to answer the user's trip-related question.

The AI should clearly distinguish:

```text
Known trip data
```

from:

```text
General knowledge
```

If information is missing, it should say so rather than inventing an answer.

---

# 22. AI Assistant UX

The AI assistant should be accessible from the Trip Workspace.

Possible UI:

```text
[Map] [Stops] [Items] [Ask AI]
```

The AI screen should feel like a trip-specific assistant rather than a generic chatbot.

Header:

```text
Trip Assistant
Pacific Northwest Road Trip
```

Suggested questions:

```text
What's my next stop?

What are my plans tomorrow?

What are my camping reservations?

What do I need to pack?

How far do I have left?
```

The user can ask free-form questions.

The AI should be able to reference the complete trip context.

---

# 23. AI Actions — Future/Optional

The initial version can be read-only.

Later, allow the AI to propose actions.

Example:

```text
User:
Add a gas station near my next stop.

AI:
I found three options.

[Add Shell]
[Add Chevron]
[Add Gas Station A]
```

Do not allow AI to silently modify the trip.

Any state-changing action must require user confirmation.

Examples:

```text
AI wants to add a pin
→ Ask for confirmation

AI wants to reorder stops
→ Ask for confirmation

AI wants to mark a stop reached
→ Ask for confirmation
```

---

# 24. Android Auto / Voice Interaction

Plan for Android Auto integration.

The goal is to allow the user to interact with their trip while driving without requiring interaction with the phone screen.

Example:

User says:

> "Read me the notes for my next pin in my Azitrip."

The system should:

1. Identify the requested trip.
2. Identify the next incomplete stop.
3. Retrieve the stop notes.
4. Respond using voice.

Example response:

> "Your next stop is Yellowstone Campground. Your note says: Check in after 4 PM. Reservation number is ABC123."

Other supported voice intents should eventually include:

```text
What's my next stop?

How far is my next stop?

What time am I expected to arrive?

Read me the notes for my next stop.

What is the next stop after this one?

What are my plans today?

How many stops do I have left?

What are my notes for Yellowstone?

Mark my current stop as reached.
```

For safety, prioritize read-only voice interactions initially.

Any state-changing operation should require explicit confirmation.

For example:

```text
User:
Mark Yellowstone as reached.

Assistant:
Would you like me to mark Yellowstone as reached?

User:
Yes.

Assistant:
Done. Your next stop is Grand Teton.
```

---

# 25. Gemini / Android Auto Integration

Investigate integration with the Android ecosystem and Gemini-enabled assistant capabilities.

The architecture should expose well-defined app capabilities that can be invoked by supported assistant surfaces.

Potential capabilities:

```text
Get next stop
Get stop notes
Get trip progress
Get ETA
Get remaining distance
Get today's stops
Get specific stop details
Get trip item information
```

The implementation must follow the currently supported Android Auto and Google/Gemini integration APIs and capabilities.

Do not assume that arbitrary natural-language commands can directly invoke private application functionality.

Where platform APIs require explicit app actions, expose appropriate structured actions/intents.

The app should have clear, machine-readable definitions for supported actions.

---

# 26. Voice Safety

Driving-related interactions should prioritize:

* Short responses
* Voice-only interaction
* No complex visual workflows while driving
* No typing requirements
* No unsafe interaction patterns

The app should not encourage the driver to manually manipulate the map while driving.

The driver should be able to ask for information using voice and receive concise spoken responses.

---

# 27. Background Location

The app should optionally track the user's location during a trip.

The user must explicitly enable location tracking.

The app should clearly explain why location is needed.

Desired behavior:

```text
Location Tracking
ON

Last location:
2 minutes ago
```

The application should periodically record:

* Latitude
* Longitude
* Timestamp
* Accuracy
* Optional speed
* Optional heading

The target sampling frequency may be approximately hourly for passive trip history.

Do not assume the mobile operating system guarantees exact hourly execution.

Use the platform's supported background location mechanisms.

The system must tolerate:

* App suspension
* Temporary GPS loss
* No network
* Device restart where supported

Offline location records should be queued and synchronized later.

---

# 28. Automatic Arrival Detection

The app may optionally detect when the user arrives at a stop.

Each stop should support:

```text
Auto-arrival detection: ON/OFF
Arrival radius: configurable
```

Example:

```text
You appear to have arrived at:

Yellowstone Campground

[Mark Reached]
```

If automatic completion is enabled:

```text
Arrived at Yellowstone Campground.

Stop marked reached.
```

The user should be able to undo this.

Do not automatically mark a stop reached solely because GPS briefly reports a location within the radius.

Consider GPS accuracy and dwell time.

---

# 29. Route Progress

The application should track two separate progress concepts.

### Stop Progress

```text
8 of 20 stops reached
```

### Geographic Progress

```text
350 miles completed
375 miles remaining
```

The map should visually reflect geographic progress.

The stop list should visually reflect stop completion.

These should not be treated as identical.

---

# 30. Current Location and Next Stop

The app should always know:

```text
Current Location
Next Incomplete Stop
Previous Stop
```

When location tracking is available, show:

```text
Current Location
↓
Next Stop
```

The primary call-to-action should generally be:

```text
Directions to Next Stop
```

The user should also be able to select any stop and get directions to that specific stop.

---

# 31. Trip Sharing and Collaboration

The existing trip invitation system should be integrated with all new functionality.

Collaborators should see shared trip information according to their permissions.

Changes should synchronize across collaborators.

Examples:

```text
User A adds a stop
↓
User B sees the new stop

User A marks a stop reached
↓
User B sees updated progress
```

The system should handle simultaneous edits safely.

If conflict resolution is needed, preserve the most recent valid change while avoiding data loss.

---

# 32. Themes and Visual Design

The primary application color palette should be based around **orange**.

Orange should be used for:

* Primary actions
* Active route
* Selected states
* Important controls
* Progress accents

Use accessible secondary colors for:

* Completed route
* Warnings
* Errors
* Informational states
* Pin types

Do not rely on color alone to communicate status.

The application must support:

* Light theme
* Dark theme

The default theme should follow the user's device/system setting.

If the application already supports theme preferences, preserve those preferences while allowing system-default behavior.

The map style should also adapt to light/dark mode where supported.

The visual design should feel:

* Modern
* Clean
* Travel-oriented
* Map-centric
* Easy to use while moving
* Accessible

Avoid overly dense interfaces.

---

# 33. Pin Visual Design

Pins should visually communicate type.

Examples:

```text
🏨 Hotel
🏕 Campground
🥾 Hiking Trail
🍴 Restaurant
⛽ Gas
⚡ EV Charger
📍 General
```

Use consistent iconography.

The selected pin should be visually prominent.

Completed pins should have a clear visual distinction.

For example:

```text
Completed:
✓ Pin

Next:
Highlighted pin

Upcoming:
Normal pin
```

---

# 34. Trip Workspace Navigation

The Trip Workspace should provide easy access to:

```text
Map
Stops
Items
AI Assistant
Trip Details
References
Settings
```

Recommended:

```text
[Map] [Stops] [Items] [Ask AI] [More]
```

The "More" section can contain:

* Trip details
* Google Sheet references
* Shared members
* Location tracking
* Trip settings
* External links

---

# 35. Trip Details

The Trip Details page should show:

* Trip name
* Description
* Trip dates
* Start
* Destination
* Number of stops
* Completed stops
* Total distance
* Remaining distance
* Collaborators
* External references
* Google Sheet link
* Location tracking status

The page should also provide entry points to:

```text
Open Map
View Stops
View Items
Ask AI
Open Google Sheet
Manage Collaborators
```

---

# 36. Third-Party Integration Architecture

All third-party integrations must be isolated behind provider interfaces.

Potential integrations:

### Mapping

Use an OSM-based mapping stack.

The exact map rendering provider can be selected independently.

### Geocoding

Use an OSM-compatible or commercial geocoding provider.

### Routing

Use an OSM-compatible routing provider such as:

* OSRM
* GraphHopper
* Valhalla

The provider should be replaceable.

### POI / Nearby Search

Use an OSM-based POI provider initially.

Keep the architecture open to a commercial provider if better POI quality is needed.

### External Navigation

Support opening:

* Google Maps
* Apple Maps
* Other supported navigation applications

### Hiking / Trails

Investigate AllTrails or another trail provider.

Use official APIs where available.

Do not scrape websites in violation of terms.

### Google Sheets

Store and open user-provided Google Sheets references.

### AI

Integrate with OpenAI APIs for the Trip Assistant.

### Android Auto / Assistant

Integrate with currently supported Android Auto and assistant APIs.

Keep the voice-command capabilities modular.

---

# 37. Data Ownership Principle

All core trip information belongs to the application.

This includes:

* Trips
* Stops
* Stop order
* Notes
* Target dates
* Target times
* Completion status
* Metadata
* Items
* Categories
* Trip progress
* Location history

External providers should enrich the experience but should not become the source of truth for core trip data.

For example:

```text
AllTrails
    ↓
Provides trail information

Your App
    ↓
Owns the trip stop
```

Similarly:

```text
Google Maps
    ↓
Provides navigation

Your App
    ↓
Owns the destination and stop order
```

---

# 38. Offline Behavior

The application should continue functioning during travel with poor connectivity.

At minimum, support offline access to:

* Existing trips
* Pins
* Stop metadata
* Notes
* Items
* Completion status

Offline actions should be queued for synchronization.

Examples:

```text
Offline:
Mark stop reached
↓
Save locally
↓
Network returns
↓
Synchronize
```

The user should see a subtle offline status.

Do not lose user changes because of temporary connectivity loss.

---

# 39. Performance

The application should comfortably support:

* 50 stops
* 100 stops
* At least 250 stops as a future target

Use marker clustering when appropriate.

Avoid unnecessary map rerenders.

Do not load every detailed stop panel simultaneously.

Only display detailed metadata for the selected stop.

Route calculations should be optimized to recalculate only affected segments when possible.

---

# 40. Recommended Implementation Sequence

Build incrementally.

## Phase 1 — Existing Trips + Map Workspace

Implement:

* Existing trip list
* Open trip
* Map-first Trip Workspace
* Current location
* Existing pins
* Map navigation
* Light/dark theme
* Orange visual system

---

## Phase 2 — Pin Management

Implement:

* Long-press add
* Search location
* Add search result
* Pin selection
* Edit pin
* Remove pin
* Notes
* Pin types
* Target date/time

---

## Phase 3 — Stop List

Implement:

* Map/List toggle
* Stop list
* Reordering
* Drag-and-drop
* Auto-save

---

## Phase 4 — Dynamic Routing

Implement:

* Route overlay
* Route segments
* Route recalculation
* Distance
* Duration
* Progress
* Completed route visualization

---

## Phase 5 — Navigation and Nearby Search

Implement:

* Directions from current location
* Directions from previous stop
* External navigation
* Nearby search
* Add nearby result as stop

---

## Phase 6 — Specialized Stop Types

Implement:

* Hotel/stay metadata
* Reservation/reference numbers
* Campground metadata
* Hiking trail integration
* External references

---

## Phase 7 — Trip Items

Implement:

* User-created categories
* Items
* Completion
* Color coding
* Category views
* Item detail

---

## Phase 8 — External References

Implement:

* Google Sheets references
* Trip Details integration

---

## Phase 9 — AI Trip Assistant

Implement:

* Trip-aware AI
* Full relevant trip context
* Suggested questions
* Read-only trip queries
* AI safety boundaries

---

## Phase 10 — Location Tracking

Implement:

* Background location
* Periodic tracking
* Offline queue
* Location history
* Arrival detection

---

## Phase 11 — Android Auto and Voice

Implement:

* Android Auto support
* Read-only voice commands
* Next stop queries
* Notes queries
* ETA queries
* Trip progress queries
* Gemini/assistant integration where platform APIs permit

Then add confirmed state-changing voice actions.

---

# 41. MVP Definition of Done

A user should be able to:

1. Log in.
2. See their existing trips.
3. Open a trip.
4. See the trip's map as the primary interface.
5. See existing pins.
6. See current location when appropriate.
7. Drag and zoom the map.
8. Long-press to add a stop.
9. Search for a location.
10. Add a search result as a stop.
11. Select a pin.
12. View pin details.
13. Add notes.
14. Set a pin type.
15. Set target date/time.
16. Remove a pin.
17. Reorder pins.
18. Automatically recalculate the route.
19. See the route as a prominent overlay.
20. See completed route segments in a different color.
21. Mark stops as reached.
22. See the next stop.
23. Get directions from current location.
24. Get directions from the previous stop.
25. Search for nearby places.
26. Add nearby places as stops.
27. View all stops in list mode.
28. Add and manage trip items.
29. Create custom item categories.
30. Color-code trip items.
31. Open a linked Google Sheet.
32. Ask the AI assistant questions about the trip.
33. Use light/dark themes based on system settings.
34. Auto-save changes.
35. Collaborate with invited trip members.

The architecture should then be extended with:

36. Background location tracking.
37. Automatic arrival detection.
38. Hiking/trail integrations.
39. Android Auto.
40. Gemini/assistant voice interactions.

---

# 42. Final Architectural Requirement

The implementation must preserve a clear separation between:

```text
Trip Data
    ↓
Business Logic
    ↓
Map / Routing / Search Providers
    ↓
External Integrations
```

The application must not become dependent on any single mapping, routing, POI, hiking, navigation, AI, or voice provider.

The following should all be replaceable independently:

* Map rendering
* Map tile provider
* Geocoding
* Routing
* POI search
* Hiking/trail data
* External navigation
* AI provider
* Voice assistant integrations

The application's own trip data remains the source of truth.

The goal is to create a **map-first collaborative trip planning application that becomes a complete travel companion**, rather than simply a wrapper around a mapping provider.
