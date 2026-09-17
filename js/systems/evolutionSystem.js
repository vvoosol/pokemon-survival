window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.EvolutionSystem = {
  megaOptions(speciesId) {
    const R = window.SurvivorRPG, species = R.PokemonData[speciesId];
    if (!species || species.evolutions?.length || species.unavailableEvolutions?.length) return [];
    const originals = Object.values(R.MegaForms || {}).filter(form => form.speciesId === speciesId);
    if (originals.length) return originals;
    // Species without an Anil mega form keep their original art and gain a one-time stat boost.
    return [{ id: 'adapted', speciesId, name: '메가' + species.name, adapted: true, types: species.types,
      baseStats: Object.fromEntries(Object.entries(species.baseStats).map(([key,value]) => [key, key === 'hp' ? value : Math.round(value * 1.2)])) }];
  },

  battleSpecies(pokemon) {
    const base = window.SurvivorRPG.PokemonData[pokemon.speciesId];
    const form = this.megaOptions(pokemon.speciesId).find(form => form.id === pokemon.megaFormId);
    return form ? { ...base, baseStats: form.baseStats, types: form.types } : base;
  },

  applyMega(pokemon, formId, stats) {
    if (pokemon.megaFormId) return false;
    const form = this.megaOptions(pokemon.speciesId).find(form => form.id === formId);
    if (!form) return false;
    const ratio = pokemon.hp / pokemon.maxHp;
    pokemon.megaFormId = form.id;
    pokemon.name = pokemon.nickname || form.name;
    pokemon.baseTypes = [...form.types];
    pokemon.types = pokemon.teraType ? [pokemon.teraType] : [...form.types];
    if (form.sprite) {
      pokemon.spriteKey = form.id;
      pokemon.spriteLayout = 'strip';
      pokemon.scale = 1.65;
      pokemon.data = { ...pokemon.data, frontSprite: form.sprite, icon: form.icon || pokemon.data.icon };
    }
    pokemon.nativeStats = stats.calculateNativeStats(this.battleSpecies(pokemon), pokemon.level);
    stats.recalculateStats(pokemon);
    pokemon.hp = pokemon.dead || pokemon.fainted ? 0 : Math.max(1, Math.round(pokemon.maxHp * ratio));
    return true;
  }
};
