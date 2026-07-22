# Trip Planning Enhancements — Prioritized Implementation Plan

## Purpose

Extend the existing trip-planning application into a complete travel planning and travel execution companion.

The existing application already supports:

* User login
* Creating trips
* Inviting collaborators
* Map-based trip planning
* Pins/stops
* Stop ordering
* Route visualization
* Notes
* Target date/time
* Pin types
* Directions
* Nearby search
* Trip item lists
* Google Sheet references
* AI trip assistant
* Planned background location tracking
* Planned Android Auto / voice integrations

This document adds the next major product capabilities based on real-world trip planning workflows.

The implementation should remain **technology-stack agnostic**. Use the existing application architecture and established libraries/services wherever possible.

The coding agent should implement the work in the priority order below.

---

# Priority 1 — Daily Itinerary / Days View

## Goal

Introduce the concept of a **Trip Day**.

A trip should not be represented only as a sequence of map pins. A trip also has a calendar-based itinerary.

Example:

```text
August 2, 2026
Grand Teton National Park

11:00 AM
Drive Boise → Craters of the Moon

2:00 PM – 6:00 PM
Hike / Explore Craters of the Moon

6:00 PM – 10:00 PM
Drive Craters of the Moon → Teton

10:00 PM
Check in at Gros Ventre Campground
```

## UX

Add a top-level navigation option:

```text
[Map] [Stops] [Days] [Items] [Ask AI]
```

The Days view should show the trip chronologically.

Example:

```text
AUG 1
📍 Boise, ID
🏨 Hotel
🚗 Drive Seattle → Boise

AUG 2
📍 Grand Teton NP
🚗 Boise → Craters of the Moon
🥾 Craters of the Moon
🚗 Craters → Teton
🏕 Gros Ventre Campground
```

Each day should display:

* Date
* Primary location
* Activities
* Travel segments
* Accommodation
* Shower availability
* Reservations
* Notes
* Target times

Allow users to:

* Add a day
* Add an activity
* Add travel
* Add accommodation
* Edit schedule items
* Reorder items within a day
* Move an item to another day

All changes auto-save.

---

# Priority 2 — First-Class Activities and Travel Segments

## Goal

Separate the concepts of:

1. Geographic Stop
2. Activity
3. Travel Segment
4. Accommodation

Do not force all of these to be represented as map pins.

## Data Concepts

### Stop

A geographic destination.

Examples:

* Boise
* Craters of the Moon
* Grand Teton
* Gros Ventre Campground

### Activity

Something the user plans to do.

Examples:

* Hike Craters of the Moon
* Visit a museum
* Go kayaking
* Eat at a restaurant

### Travel Segment

Movement between locations.

Example:

```text
Boise
→
Craters of the Moon
```

### Accommodation

Where the user stays overnight.

Examples:

* Hotel
* Campground
* Airbnb
* Friend's house

## UX

A day's timeline should look like:

```text
AUGUST 2

11:00 AM
🚗 Travel
Boise → Craters of the Moon
Estimated: 3 hours

2:00 PM
🥾 Activity
Explore Craters of the Moon
Duration: 4 hours

6:00 PM
🚗 Travel
Craters → Grand Teton
Estimated: 4 hours

10:00 PM
🏕 Accommodation
Gros Ventre Campground
Site 298 · Loop F
```

Travel segments should connect to the map route.

Activities may optionally have geographic coordinates.

Activities should be able to reference an existing stop.

Example:

```text
Stop:
Craters of the Moon

Activity:
Hike Craters of the Moon
```

---

# Priority 3 — Reservation Management

## Goal

Create structured reservation information rather than storing everything in free-form notes.

A reservation may be associated with:

* Hotel
* Campground
* Activity
* Tour
* Restaurant
* Transportation
* Other

## Reservation Fields

Support:

* Reservation name
* Provider
* Confirmation number
* Reservation/reference number
* Reservation URL
* Phone number
* Check-in date/time
* Check-out date/time
* Site number
* Room number
* Loop
* Reservation holder
* Cost
* Cancellation deadline
* Notes

Fields should be flexible because different reservation types require different information.

## Example

```text
Gros Ventre Campground

Reservation
Provider: National Park Service

Site: 298
Loop: F

Confirmation:
0824914908-1

Check-in:
Aug 2, 2026

Check-out:
Aug 3, 2026
```

## UX

On the accommodation detail page:

```text
Gros Ventre Campground
🏕 Campground

Site 298
Loop F

Confirmation:
0824914908-1

[Open Reservation]
[Get Directions]
[Edit Reservation]
```

The AI assistant should be able to answer questions such as:

* "What's my campsite number tonight?"
* "What's my reservation number?"
* "Where am I staying tomorrow?"
* "What's my hotel confirmation number?"

---

# Priority 4 — Time-Based Schedule and Conflict Detection

## Goal

Make the trip itinerary time-aware.

Each activity and travel segment should optionally support:

* Start date/time
* End date/time
* Estimated duration

The system should compare scheduled activities with estimated travel times.

## Example

```text
Activity:
2 PM – 6 PM

Next travel:
6 PM – 10 PM

Status:
✓ Fits schedule
```

If the schedule is impossible:

```text
Activity ends:
6 PM

Travel required:
5 hours

Available:
4 hours

⚠️ Schedule conflict
```

## Conflict Types

Detect:

* Overlapping activities
* Insufficient travel time
* Impossible arrival times
* Arrival after reservation check-in
* Departure after required activity start
* Accommodation check-in conflicts
* Excessively short buffers

Display warnings without automatically changing the itinerary.

Example:

> ⚠️ You have only 15 minutes between your scheduled activity and the estimated travel time to your next destination.

---

# Priority 5 — Reschedule / "Running Behind" Mode

## Goal

Allow users to dynamically adjust the itinerary when reality differs from the plan.

The user should have an action:

```text
I'm Running Behind
```

or:

```text
Reschedule From Here
```

## UX

The user can specify:

```text
I'm 3 hours behind.
```

The application should:

1. Determine current location.
2. Determine current trip progress.
3. Identify completed activities.
4. Identify remaining itinerary.
5. Shift or recalculate future schedule.
6. Recalculate travel times.
7. Detect reservation conflicts.
8. Identify activities that no longer fit.
9. Suggest alternatives.

Example:

```text
You are currently approximately 3 hours behind schedule.

This would cause:

⚠️ Craters of the Moon hike to end at 9 PM
⚠️ Arrival at Gros Ventre at approximately 1 AM

Suggested options:

1. Shorten hike
2. Skip Craters of the Moon
3. Switch to alternative accommodation
4. Move today's activities to tomorrow
5. Keep schedule and arrive late
```

The application must not automatically delete or permanently change plans without user confirmation.

---

# Priority 6 — Primary and Alternative Accommodation

## Goal

Allow users to specify a primary accommodation and one or more backup options.

Example:

```text
PRIMARY
🏕 Gros Ventre Campground

Site 298
Loop F
Confirmation: 0824914908-1

ALTERNATIVE
🏡 Buffalo Valley Ranch
```

## UX

Users should be able to:

* Add primary accommodation
* Add alternative accommodation
* Switch active accommodation
* Edit alternatives
* Remove alternatives

When switching accommodation:

* Update the active itinerary
* Update route
* Update directions
* Update AI context
* Preserve original reservation information
* Mark previous primary as alternative

The app should not delete the original reservation.

---

# Priority 7 — Today / Daily Travel View

## Goal

Create a focused view for the current day.

This should become the primary "travel mode" screen.

Example:

```text
TODAY
August 2

📍 Grand Teton National Park

11:00 AM
🚗 Leave Boise

2:00 PM
🥾 Craters of the Moon
2–6 PM

6:00 PM
🚗 Drive to Teton

10:00 PM
🏕 Gros Ventre Campground
Site 298 · Loop F

🚿 Shower
No

📋 Today's Reminders
☐ Camp stove
☐ Reservation information
☐ Hiking gear

[Open Map]
[Directions to Next]
[Ask AI]
```

The Today view should dynamically update based on:

* Current date
* Current time
* Current location
* Completed stops
* Completed activities

---

# Priority 8 — Improved Packing and Item Management

## Goal

Expand the existing trip item list into a complete packing and preparation system.

Each item should support:

* Name
* Category
* Quantity
* Unit, if applicable
* Color
* Notes
* Required status
* Packed status
* Purchase status

## Suggested Statuses

Support at least:

```text
Need to Buy
Have
Need to Pack
Packed
Used
```

Example:

```text
CAMP

☑ Tent
☑ Sleeping Bag
☐ Camp Stove
   Quantity: 1

FOOD

☑ Tofu Jerky
   Quantity: 4

SAFETY

☐ Road Flares
☐ Traffic Cones
```

The user should be able to define custom categories.

Examples:

* MED
* FOOD
* CAMP
* MISC
* SAFETY
* CLOTHING

Do not hard-code these categories.

---

# Priority 9 — Associate Items with Days, Activities, and Stops

## Goal

Allow packing items to be associated with parts of the itinerary.

Examples:

```text
Craters of the Moon Hike

Required Items:
☐ Hiking shoes
☐ Water
☐ Sunscreen
☐ Hat
```

Or:

```text
Gros Ventre Campground

Required:
☐ Tent
☐ Sleeping bag
☐ Camp stove
☐ Fuel
```

Items should remain part of the overall trip item list but may have optional associations.

The same item may be associated with multiple activities.

Example:

```text
Water
→ Craters hike
→ Grand Teton hike
→ Road travel
```

The AI assistant should be able to answer:

> "What do I need for tomorrow's hike?"

> "Do I have everything I need for camping tonight?"

> "Which items haven't been packed that I need today?"

---

# Priority 10 — AI Daily Trip Briefing

## Goal

Use the existing AI Trip Assistant to generate a concise daily briefing.

Example:

> Good morning! Today you're traveling from Boise to Grand Teton.

> You'll leave Boise at 11 AM and arrive at Craters of the Moon around 2 PM. You have four hours planned there before continuing to Grand Teton.

> Tonight you're staying at Gros Ventre Campground, Site 298, Loop F. Your reservation number is 0824914908-1.

> No shower is currently planned today.

> You have two important items that are not yet packed: your camp stove and hiking gear.

The briefing should be generated from actual trip data.

The AI must not invent information.

The user should be able to ask follow-up questions.

---

# Priority 11 — Shower and Travel Logistics Tracking

## Goal

Treat shower availability as a structured logistical attribute rather than an arbitrary spreadsheet checkbox.

Each day or accommodation should support:

```text
Shower:
Yes
No
Unknown
```

The app should show:

```text
Next Planned Shower:
August 4
```

If several days pass without a planned shower, optionally surface a gentle reminder.

Example:

> 🚿 You don't currently have a shower planned for the next 3 days.

The user should be able to search for nearby shower options.

Potential categories:

* Campground showers
* Truck stops
* Gyms
* Recreation centers
* Public pools
* Hotels
* Other facilities

Do not automatically add these locations as trip stops.

---

# Priority 12 — Reservation Calendar / Reservation View

## Goal

Provide a dedicated chronological view of reservations.

Example:

```text
RESERVATIONS

AUG 1
🏨 Hotel
Boise, ID
Confirmation: ABC123

AUG 2
🏕 Gros Ventre Campground
Site 298 · Loop F
Confirmation: 0824914908-1

AUG 4
🏨 Hotel
Jackson, WY
Confirmation: XYZ456
```

Allow users to:

* Open reservation
* Edit reservation
* Navigate to reservation location
* View confirmation number
* View check-in/out information

The reservation view should be accessible from:

* Trip Details
* Days
* Today
* AI assistant

---

# Priority 13 — Trip Readiness Dashboard

## Goal

Create a pre-trip and in-trip health/readiness dashboard.

Example:

```text
TRIP READINESS

🗺 Route
✓ 24 stops planned

📅 Schedule
⚠️ 2 schedule conflicts

🏕 Accommodations
⚠️ 2 nights have no reservation

📋 Packing
✓ 87% packed

🚿 Showers
⚠️ No shower planned for 3 days

📄 References
✓ Google Sheet connected

📍 Progress
4 of 24 stops reached
```

The dashboard should identify actionable issues.

Each warning should be tappable.

Example:

```text
⚠️ 2 nights have no reservation
↓
Show affected dates
```

Or:

```text
⚠️ Schedule conflict
↓
Open affected day
```

---

# Priority 14 — Trip Rescheduling by Date

## Goal

Support the existing spreadsheet concept of:

```text
Reschedule Date
```

Users should be able to move:

* Individual activities
* Individual stops
* Entire days
* Remaining itinerary

## Options

```text
Move this activity
Move this stop
Move entire day
Shift everything from here onward
```

Example:

```text
Original

Aug 2
Teton

Aug 3
Yellowstone

Aug 4
Glacier
```

User chooses:

```text
Shift everything from Aug 2 by 1 day
```

Result:

```text
Aug 3
Teton

Aug 4
Yellowstone

Aug 5
Glacier
```

The system should:

* Update dates
* Preserve relative order
* Update target times
* Update reservations where appropriate
* Detect reservation conflicts
* Recalculate schedule

Reservations should never be silently changed.

---

# Priority 15 — Smart Trip Progress

## Goal

Combine:

* Stop completion
* Current location
* Schedule
* Time
* Activities

to determine trip progress.

Example:

```text
CURRENT STATUS

📍 Near Craters of the Moon

Today's plan:
✓ Leave Boise
→ Craters of the Moon
○ Gros Ventre Campground

Schedule:
15 minutes behind

Next:
🥾 Craters of the Moon

ETA:
1:45 PM

Target:
2:00 PM

Status:
✓ On schedule
```

The app should distinguish:

* Planned
* In progress
* Completed
* Skipped
* Delayed
* Rescheduled

---

# Priority 16 — AI "Trip Operations" Capabilities

Once the above data exists, expand the AI assistant.

The AI should answer questions such as:

### Schedule

```text
What's my plan tomorrow?

What am I doing this afternoon?

What time do I need to leave?

Am I running behind?
```

### Accommodation

```text
Where am I staying tonight?

What's my campsite number?

What's my reservation number?

What's my backup accommodation?
```

### Packing

```text
What do I need for tomorrow's hike?

What camping gear haven't I packed?

What do I need to buy?
```

### Logistics

```text
When is my next shower?

How far do I have to drive today?

How many hours will I spend driving?
```

### Progress

```text
How far along am I?

How many stops have I completed?

What's my next stop?
```

### Planning

```text
Which day is the busiest?

Where do I have schedule conflicts?

Which reservations might be affected if I'm delayed?
```

The AI should use structured trip data wherever possible.

Do not rely on the AI to calculate exact distances, dates, or times when deterministic application data is available.

---

# Recommended Data Relationships

The application should conceptually evolve toward:

```text
TRIP
│
├── DAYS
│    │
│    ├── ACTIVITIES
│    │
│    ├── TRAVEL SEGMENTS
│    │
│    ├── STOPS
│    │
│    ├── ACCOMMODATIONS
│    │
│    └── DAILY LOGISTICS
│         └── Shower availability
│
├── ROUTE
│    └── Ordered geographic stops
│
├── RESERVATIONS
│
├── ITEMS
│    ├── Categories
│    ├── Packing status
│    ├── Quantities
│    └── Itinerary associations
│
├── EXTERNAL REFERENCES
│
├── LOCATION HISTORY
│
└── AI CONTEXT
```

The key distinction is:

```text
ROUTE
=
Where am I going?

ITINERARY
=
What am I doing and when?

RESERVATIONS
=
What have I booked?

ITEMS
=
What do I need?

LOCATION
=
Where am I actually?

AI
=
Help me understand and manage all of this.
```

---

# Implementation Order

Implement the features in this order:

```text
1. Daily Itinerary / Days
        ↓
2. Activities + Travel Segments
        ↓
3. Reservations
        ↓
4. Time Scheduling + Conflict Detection
        ↓
5. Rescheduling / Running Behind
        ↓
6. Primary + Alternative Accommodation
        ↓
7. Today View
        ↓
8. Enhanced Packing
        ↓
9. Items Associated with Itinerary
        ↓
10. AI Daily Briefing
        ↓
11. Shower / Logistics
        ↓
12. Reservation Calendar
        ↓
13. Trip Readiness Dashboard
        ↓
14. Date-Based Rescheduling
        ↓
15. Smart Progress
        ↓
16. Advanced AI Trip Operations
```

---

# Development Requirements

For each feature:

1. Review the existing application architecture before implementation.
2. Reuse existing trip, user, collaboration, map, stop, and item models where appropriate.
3. Avoid creating duplicate representations of the same trip data.
4. Maintain backward compatibility with existing trips.
5. Existing trips without itinerary/day data should continue to work.
6. Migrate existing pins/stops into the new model without data loss.
7. Auto-save all user changes.
8. Preserve offline functionality where currently supported.
9. Ensure all collaborative trip changes synchronize correctly.
10. Add appropriate loading, empty, error, and offline states.
11. Add tests for business logic and critical user workflows.
12. Do not introduce a new third-party service when existing application functionality can support the requirement.
13. Keep third-party providers replaceable.
14. Do not let AI become the source of truth for structured trip data.
15. Require explicit user confirmation before AI performs destructive or itinerary-changing actions.

---

# First Implementation Task

Before writing code, inspect the existing application and produce an implementation assessment containing:

1. Current trip data model
2. Current stop/pin data model
3. Current route implementation
4. Current item list implementation
5. Current trip collaboration model
6. Current map provider and routing provider
7. Current AI integration
8. Current external-reference support
9. Existing offline/synchronization behavior
10. Existing navigation structure

Then propose:

* Required data model changes
* Required API/backend changes
* Required UI/navigation changes
* Required migrations
* Required third-party integrations
* Dependencies between features

Do not immediately implement all features.

First create the assessment and implementation sequence.

Then implement **Priority 1: Daily Itinerary / Days View** completely, including data model, API/backend behavior, UI, auto-save, collaboration, migration compatibility, and tests.

After Priority 1 is complete and verified, proceed to Priority 2.
