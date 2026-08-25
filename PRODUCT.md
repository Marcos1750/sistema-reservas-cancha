# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing React/Vite application; preserve the current frontend and backend stack.

## Users

Frequent football players in Argentina who want to repeat or organize a match quickly from a phone, usually in the afternoon or evening.

## Product Purpose

El Patio helps players discover nearby football pitches, compare availability and price, and reserve the next match with minimal coordination effort. The first redesign is a realistic interactive demo while the multi-venue data model is still pending.

## Positioning

The product turns the informal ritual of arranging an amateur football match into a clear, dependable booking flow with local language, Argentine pesos, nearby venues and visible time slots.

## Operating Context

Players use the public experience on mobile to browse venues, filter by date/time and pitch type, inspect a venue and confirm a turn. Staff use the admin experience to review bookings, dates and occupancy.

## Capabilities and Constraints

The current API supports reservations and blocked dates for one venue. The redesign must keep those endpoints compatible and use realistic client-side fixtures for the marketplace demo rather than changing the database or API. The interface must include discovery, detail, confirmation, saved turns, profile and administration surfaces.

## Brand Commitments

The existing product name is El Patio. The visual language is an elegant, modern and trustworthy night football identity: deep charcoal, dark forest surfaces, sophisticated grass green, restrained lime accents and warm white text. It uses a subtle tactical-pitch visual system, geometric sans-serif typography and no gamer styling, generic shields or posed player imagery.

## Evidence on Hand

The repository contains the current React reservation form, admin panel, API client and backend reservation endpoints. No verified venue photography is available; the first catalogue should use authored pitch placeholders and reserve real photography for venue detail later.

## Product Principles

- Make the next match easy to find.
- Show availability and price before asking for commitment.
- Make local context feel natural and useful.
- Keep repeated reservations fast and legible.
- Treat staff operations as part of the same trusted product.

## Accessibility & Inclusion

Prioritize strong contrast, visible focus, comfortable touch targets, clear Argentine Spanish copy and layouts that remain legible at mobile widths.
