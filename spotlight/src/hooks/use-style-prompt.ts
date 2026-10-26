import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { checkStyleRequest, styleRequestError } from '@/data/style-messages';
import type { StyleSession } from '@/data/style-session';
import { DEFAULT_WEATHER_SETTINGS, type WeatherSettings } from '@/data/weather-settings';

import { useClosetServices } from './closet-services';
import { useIsMounted } from './use-is-mounted';
import { styleServices, type StyleServices } from './style-services';

/** The location intro on the Style screen (before the system prompt). */
export interface LocationIntroState {
  visible: boolean;
  /** True while the system prompt is up. */
  requesting: boolean;
  allow: () => void;
  notNow: () => void;
}

/**
 * The Style screen's state: the request text, the recent requests (reloaded
 * on focus; none when storage fails), "Match today's weather" (slice 5a),
 * and the two ways to start:
 * - `submit` (plain request): starts it (`StyleSessions.begin`, so a double
 *   tap starts one) and remembers it. Returns the session to show, or null.
 * - `submitWeather` (the weather row on): first shows the location intro
 *   when it is due (`LocationIntroGate`) and waits for Allow or Not now,
 *   then starts a match-weather request; the text may be empty.
 * The weather row only works while "Use local weather" is on (the Me
 * tab's setting, reloaded on focus).
 */
export function useStylePrompt(services: StyleServices = styleServices()) {
  const { repository } = useClosetServices();
  const isMounted = useIsMounted();
  const [text, setText] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const [weatherSettings, setWeatherSettings] = useState<WeatherSettings>(DEFAULT_WEATHER_SETTINGS);
  const [matchWeatherChosen, setMatchWeather] = useState(false);
  const [intro, setIntro] = useState<{ requesting: boolean } | null>(null);
  const introAnswer = useRef<(() => void) | null>(null);
  const weatherPending = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      services.recentRequests.load().then(
        (list) => active && setRecents(list),
        () => undefined,
      );
      services.weather.settings.load().then(
        (settings) => active && setWeatherSettings(settings),
        () => undefined,
      );
      return () => {
        active = false;
      };
    }, [services]),
  );

  const weatherAvailable = weatherSettings.useLocalWeather;
  const matchWeather = matchWeatherChosen && weatherAvailable;
  const check = checkStyleRequest(text);
  const weatherText = check.ok ? check.request : check.reason === 'empty' ? '' : null;

  function remember(request: string) {
    if (request.length === 0) return;
    services.recentRequests.add(request).then(
      (list) => isMounted() && setRecents(list),
      () => undefined,
    );
  }

  function submit(): StyleSession | null {
    if (!check.ok) return null;
    const session = services.sessions.begin(check.request, {
      generator: services.generator,
      loadCloset: () => repository.list(),
    });
    if (!session) return null;
    remember(check.request);
    return session;
  }

  async function submitWeather(): Promise<StyleSession | null> {
    if (weatherText === null || weatherPending.current) return null;
    weatherPending.current = true;
    try {
      let introDue = false;
      try {
        introDue = await services.weather.introGate.shouldShow(weatherSettings);
      } catch {
        introDue = false;
      }
      if (introDue && isMounted()) {
        await new Promise<void>((resolve) => {
          introAnswer.current = resolve;
          setIntro({ requesting: false });
        });
      }
      const session = services.sessions.begin(
        weatherText,
        {
          generator: services.generator,
          loadCloset: () => repository.list(),
          resolveWeather: (signal) => services.weather.today.resolve({ signal }),
        },
        { matchWeather: true },
      );
      if (session) remember(weatherText);
      return session;
    } finally {
      weatherPending.current = false;
    }
  }

  function closeIntro() {
    setIntro(null);
    const answer = introAnswer.current;
    introAnswer.current = null;
    answer?.();
  }

  const locationIntro: LocationIntroState = {
    visible: intro !== null,
    requesting: intro?.requesting ?? false,
    allow: () => {
      if (!intro || intro.requesting) return;
      setIntro({ requesting: true });
      services.weather.introGate.allow().then(closeIntro, closeIntro);
    },
    notNow: () => {
      if (intro?.requesting) return;
      closeIntro();
    },
  };

  return {
    text,
    setText,
    recents,
    error: styleRequestError(text),
    canSubmit: matchWeather ? weatherText !== null : check.ok,
    submit,
    submitWeather,
    weatherAvailable,
    matchWeather,
    setMatchWeather,
    locationIntro,
  };
}
