window.SurvivorRPG = window.SurvivorRPG || {};

(() => {
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  window.SurvivorRPG.BuildConfig = Object.freeze({
    VERSION: 'v1.0.0-rc1',
    SAVE_VERSION: 5,
    DEBUG: params.get('debug') === '1'
  });
})();
