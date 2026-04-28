// PostHog analytics for aiPRINT.ai
// Loaded on every page. Identifies authenticated users automatically and
// exposes window.track(event, props) for manual event capture.
(function () {
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_session_recording opt_out_session_recording has_opted_in_session_recording has_opted_out_session_recording clear_opt_in_out_session_recording".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init('phc_zeJEemTAFbpTsTd8ERyVa6oXXK7do6CfzZiecwTsTAxR', {
    api_host: 'https://us.i.posthog.com',
    defaults: '2026-01-30',
    person_profiles: 'identified_only'
  });

  // Helper: track a named event with optional properties
  window.track = function (event, props) {
    try { window.posthog && window.posthog.capture(event, props || {}); } catch (e) {}
  };

  // Identify the authenticated user when auth is ready
  function identifyIfAuthed() {
    try {
      if (window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated() && window.auth.user) {
        const u = window.auth.user;
        window.posthog.identify(String(u.id || u.email), {
          email: u.email,
          credits_balance: u.credits_balance
        });
      }
    } catch (e) {}
  }
  // auth.js initializes asynchronously; try a few times
  let tries = 0;
  const t = setInterval(() => {
    identifyIfAuthed();
    if (++tries > 10) clearInterval(t);
  }, 500);

  // ---------------------------------------------------------------------------
  // Meta Pixel (Facebook/Instagram) — base code + PageView
  // Pixel ID: 2679208262451729 (aiPRINT.ai dataset, AiPrint portfolio)
  // ---------------------------------------------------------------------------
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', '2679208262451729');
  window.fbq('track', 'PageView');

  // Helper: fire a Meta event with a stable event_id for CAPI deduplication.
  // Pair this with a server-side CAPI call using the same event_id.
  window.metaTrack = function (event, params, eventId) {
    try {
      if (!window.fbq) return;
      const id = eventId || (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
      window.fbq('track', event, params || {}, { eventID: id });
      return id;
    } catch (e) {}
  };
})();
