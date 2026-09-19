window.SurvivorRPG.loadStoryJSON = async function(url) {
  if (window.SurvivorRPG.storyDataReady) {
    const data = await window.SurvivorRPG.storyDataReady();
    if (!(url in data)) throw Error(`배포 데이터 누락: ${url}`);
    return data[url];
  }
  const response = await fetch(url);
  if (!response.ok) throw Error(`스토리 데이터를 불러올 수 없습니다: ${url}`);
  return response.json();
};
