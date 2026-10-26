# weather

Today's weather as a short summary, for "Match today's weather" (and, in slice 5b, Look of the day). The app passes the summary straight to [`generate-outfits`](generate-outfits.md) as `weather`; coordinates and city names never reach Claude.

**Status (Gate 3 slice 5a): live.** Data from [Open-Meteo](https://open-meteo.com) (Gate 3 decision D9): free tier, no key, non-commercial use only, under 10,000 calls a day, licence CC BY 4.0. The app shows the credit `Weather data by Open-Meteo.com` wherever weather appears. A public store release needs Open-Meteo's paid plan.

- **Endpoint:** `POST <SUPABASE_URL>/functions/v1/weather`
- **Source:** `supabase/functions/weather/` (thin Deno entry `index.ts`, logic in `handler.ts`, Open-Meteo calls and parsing in `open-meteo.ts`, the WMO code table in `wmo.ts`, the hourly cache in `cache.ts`), shared code in `supabase/functions/_shared/` (`dev-token.ts`, `http-body.ts`, `rate-limit.ts`, `claude.ts` for the status mapping, the contracts).
- **Contract:** `supabase/functions/_shared/weather-contract.ts` (source of truth) and its byte-identical app copy `spotlight/src/ai/weather-contract.ts`; `weather-contract.test.ts` fails when they drift and checks this doc. The summary type is `WeatherSummary` from the generate-outfits contract.
- **Config:** `verify_jwt = false` in `supabase/config.toml`; the function checks the development token itself (`DEV_TOKEN` secret), as tag-item does. Deploy with `supabase functions deploy weather --use-api` from the repo root.

## Request

Headers: `Authorization: Bearer <dev token>`, `Content-Type: application/json`.

Exactly one of two forms (sending both is 400):

| Field | Type | Rules |
| --- | --- | --- |
| `lat` | number | Latitude, -90 to 90, **rounded to 0.1 degree** (at most one decimal, about 11 km). |
| `lon` | number | Longitude, -180 to 180, rounded to 0.1 degree. |
| `city` | string | A place name the user typed (the home city on the Me tab). Trimmed, whitespace runs collapsed; then 1 to 80 characters (code points), no control characters. |

More precise coordinates are refused (400 `bad_request`), not rounded: the app must round before the position leaves the phone (`roundPosition` in the contract), so a precise position never reaches the server at all. `null` counts as absent; unknown extra fields are ignored.

```json
{ "lat": 51.5, "lon": -0.1 }
```

```json
{ "city": "London" }
```

## Response (200)

```json
{
  "apiVersion": 1,
  "place": { "name": "London, United Kingdom" },
  "weather": { "highC": 14, "lowC": 8, "rainChance": 60, "windKph": 22, "conditions": "rain", "intensity": "light" },
  "attribution": "Weather data by Open-Meteo.com"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `apiVersion` | number | `1`. |
| `place` | object, optional | Only for a city request: `place.name`, the place Open-Meteo matched (its name and country, e.g. "London, United Kingdom"; the name alone when that is over 120 characters), so the user can see which London. Absent for coordinates (no reverse geocoding). |
| `weather` | object | Today's summary in the place's own time zone (`timezone=auto`, `forecast_days=1`), the generate-outfits `WeatherSummary`: |
| `weather.highC` | number | Today's high, °C, rounded to a whole degree. |
| `weather.lowC` | number | Today's low, °C, rounded. |
| `weather.rainChance` | number | Today's highest precipitation probability, percent, 0 to 100 (0 when Open-Meteo has none for the place). |
| `weather.windKph` | number | Today's highest wind speed at 10 m, km/h, rounded (0 when missing). |
| `weather.conditions` | string | From the WMO code, see the table below. |
| `weather.intensity` | string, optional | `light`, `moderate` or `heavy`, from the WMO code; absent where it gives none. |
| `attribution` | string | Always `Weather data by Open-Meteo.com`. |

The app checks the body with `validateWeatherResponse` (a malformed `place` is dropped; a malformed `weather` rejects the answer).

## WMO weather codes

Open-Meteo's daily `weather_code` (`weather/wmo.ts`, `WMO_TABLE`):

| WMO code | Meaning | `conditions` | `intensity` |
| --- | --- | --- | --- |
| 0 | Clear sky | `clear` | none |
| 1 | Mainly clear | `partly-cloudy` | none |
| 2 | Partly cloudy | `partly-cloudy` | none |
| 3 | Overcast | `cloudy` | none |
| 45 | Fog | `fog` | none |
| 48 | Depositing rime fog | `fog` | none |
| 51 | Drizzle, light | `drizzle` | `light` |
| 53 | Drizzle, moderate | `drizzle` | `moderate` |
| 55 | Drizzle, dense | `drizzle` | `heavy` |
| 56 | Freezing drizzle, light | `drizzle` | `light` |
| 57 | Freezing drizzle, dense | `drizzle` | `heavy` |
| 61 | Rain, slight | `rain` | `light` |
| 63 | Rain, moderate | `rain` | `moderate` |
| 65 | Rain, heavy | `rain` | `heavy` |
| 66 | Freezing rain, light | `rain` | `light` |
| 67 | Freezing rain, heavy | `rain` | `heavy` |
| 71 | Snow fall, slight | `snow` | `light` |
| 73 | Snow fall, moderate | `snow` | `moderate` |
| 75 | Snow fall, heavy | `snow` | `heavy` |
| 77 | Snow grains | `snow` | none |
| 80 | Rain showers, slight | `rain` | `light` |
| 81 | Rain showers, moderate | `rain` | `moderate` |
| 82 | Rain showers, violent | `rain` | `heavy` |
| 85 | Snow showers, slight | `snow` | `light` |
| 86 | Snow showers, heavy | `snow` | `heavy` |
| 95 | Thunderstorm, slight or moderate | `thunderstorm` | none |
| 96 | Thunderstorm with slight hail | `thunderstorm` | none |
| 99 | Thunderstorm with heavy hail | `thunderstorm` | `heavy` |

Choices: freezing drizzle and freezing rain stay `drizzle` and `rain` (the low temperature already says it freezes); showers count as rain or snow; 1 (mainly clear) counts as `partly-cloudy`. Any code not in the table (Open-Meteo documents none) maps to `cloudy` with no intensity.

## Errors

Body: `{ "error": { "code": "<code>", "message": "<text>" } }`. Messages are fixed; Open-Meteo's own messages are never passed on.

| Status | Code | When |
| --- | --- | --- |
| 405 | `method_not_allowed` | Not POST (`Allow: POST`). |
| 401 | `unauthorized` | Missing, malformed or wrong token. |
| 500 | `server_misconfigured` | A well-formed token but no usable `DEV_TOKEN` secret. |
| 429 | `rate_limited` | More than 30 requests in the current minute to this instance (best effort, see below), with `Retry-After` in seconds. |
| 400 | `too_large` | Body over 1,024 bytes. |
| 400 | `bad_request` | Unreadable body, not JSON, both forms or neither, a coordinate out of range or with more than one decimal, a city of 0 or over 80 characters or with a control character. |
| 404 | `place_not_found` | A city request that Open-Meteo's geocoding could not match. |
| 503 | `upstream_unavailable` | Open-Meteo is down, answered 5xx, or the connection failed. |
| 503 | `upstream_rate_limited` | Open-Meteo answered 429 (the free tier's limits). |
| 504 | `upstream_timeout` | No complete answer from Open-Meteo in time. |
| 502 | `upstream_rejected` | Open-Meteo answered another 4xx, or a 200 that could not be read (not JSON, no code or temperatures, out of range). |
| 500 | `internal` | Anything unexpected. |

`bad_request`, `too_large`, `unauthorized`, `method_not_allowed`, `rate_limited`, `server_misconfigured`, `internal` and the four `upstream_*` codes are the tag-item codes (`WEATHER_ERROR_CODES` adds `place_not_found`).

## Limits, time and caching

- Body: at most 1,024 bytes.
- Coordinates: at most one decimal. City: 1 to 80 characters.
- Time: each Open-Meteo call at most 5 s, both calls of a city request together at most 8 s; the app gives up after 12 s.
- Rate limit: 30 requests a minute per function instance, counted after the token check (`_shared/rate-limit.ts`; best effort, the platform runs several instances).
- Cache: per instance, in memory, keyed by the rounded position or the lowercased city, reused within the same clock hour (UTC), at most 256 entries (oldest dropped first). Best effort like the rate limit. The keys (rounded position, city) live only in memory for at most the hour; nothing is written to storage.
- Open-Meteo calls (`open-meteo.ts`): forecast `https://api.open-meteo.com/v1/forecast` with `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max`, `timezone=auto`, `forecast_days=1`; geocoding `https://geocoding-api.open-meteo.com/v1/search` with `count=1`, `language=en`. A city request uses the matched place's coordinates for the forecast.

## Logging and privacy

One JSON line per request: `{"fn":"weather","event":"answer","status","kind","cache","upstream_calls","latency_ms"}` plus `error` (the code) for a failure. `kind` is `position`, `city` or null (rejected before the body was read); `cache` is `hit`, `miss` or null. The function never logs headers, the token, the coordinates, the city, the place name, the Open-Meteo URLs or the weather. An unexpected error logs only `weather: unexpected error`. Nothing is stored server-side.

## App side

- **Client:** `WeatherClient` (`spotlight/src/ai/weather-client.ts`) with `MockWeatherClient`, `FakeWeatherClient` and `RemoteWeatherClient` (`remote-weather-client.ts`: plain `fetch`, 12 s timeout, `AbortSignal`, never throws).
- **Failures** (`WeatherFailure`): `not-configured`, `no-token`, `unauthorized`, `offline`, `timeout`, `rejected` (400, or a request the app finds invalid, never sent), `rate-limited` (429), `place-not-found` (404), `server` (other statuses), `invalid-response` (a 200 that fails `validateWeatherResponse`), `cancelled`.
- **Where it is used:** `TodayWeather` (`spotlight/src/data/today-weather.ts`) picks the position (rounded in `LocationProvider`) or the home city, keeps today's answer in the settings database (per day and place), and calls the client otherwise.
