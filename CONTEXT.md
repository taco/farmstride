# FarmStride

A mobile-first app for riders at a barn to log riding sessions, by voice where possible, and keep track of the horses they work with.

## Language

**Session**:
A single ride or training session with one horse, logged by one rider. Never an auth session or a browser session; those are called "login" and "visit" if they come up at all.
_Avoid_: Ride, lesson, workout, auth session

**Rider**:
A person with a FarmStride account. Every logged-in user is a rider, whatever their role at the barn.
_Avoid_: User, account, member

**Barn**:
The tenant boundary. Riders, horses, and sessions all belong to exactly one barn.
_Avoid_: Stable, organization, team
