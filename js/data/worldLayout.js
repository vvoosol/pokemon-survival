window.SurvivorRPG = window.SurvivorRPG || {};

(function buildWorldLayouts() {
  const R = window.SurvivorRPG;
  // Coordinates refer to complete, unchanged objects in the original Anil atlases.
  R.WorldArt = {
    tree: { sx:128, sy:1312, sw:64, sh:128, solid:[14,96,36,26] },
    pine: { sx:192, sy:1312, sw:64, sh:128, solid:[17,96,30,26] },
    rock: { sx:160, sy:480, sw:64, sh:64, solid:[8,25,48,32] },
    flowers: { sx:160, sy:128, sw:64, sh:32 },
    sign: { sx:224, sy:320, sw:32, sh:32, solid:[5,12,22,18] },
    center: { sx:0, sy:3040, sw:224, sh:256, solid:[12,60,200,184] },
    shop: { sx:16, sy:3392, sw:192, sh:192, solid:[8,50,174,128] },
    lab: { sx:0, sy:4000, sw:192, sh:224, solid:[12,38,168,174] },
    caveRock: { atlas:'caveTiles', sx:192, sy:544, sw:64, sh:64, solid:[7,20,50,40] }
  };
  const add = (map,art,x,y) => {
    const source=R.WorldArt[art], object={art,x,y,width:source.sw,height:source.sh};
    map.objects.push(object);
    if(source.solid) {
      const [dx,dy,width,height]=source.solid;
      map.colliders.push({x:x+dx,y:y+dy,width,height});
    }
  };
  const row = (map,x,y,count,art='tree',gap=64) => {
    for(let i=0;i<count;i++)add(map,art,x+i*gap,y);
  };
  for(const map of Object.values(R.Maps)) {
    map.objects=[];map.colliders=[];map.decorations=[];
    map.biome=map.id==='hunting_03'||map.id==='hunting_05'?'cave':map.id==='hunting_02'||map.id==='hunting_04'?'forest':'meadow';
    map.tileSources.grassA={sx:0,sy:32,sw:32,sh:32};
    map.tileSources.grassB={sx:32,sy:32,sw:32,sh:32};
    map.tileSources.path={sx:32,sy:160,sw:32,sh:32};
    if(map.id==='hub') {
      map.name='시작의 마을';
      map.paths=[{x:480,y:480,width:672,height:128},{x:704,y:384,width:160,height:480},
        {x:736,y:704,width:352,height:160}];
      add(map,'center',448,240);add(map,'lab',576,672);
      row(map,288,128,16);row(map,288,920,16);
      for(const x of [288,1280])for(let y=288;y<920;y+=128)add(map,'tree',x,y);
      for(const [x,y] of [[384,560],[1120,656],[864,736],[864,400]])add(map,'flowers',x,y);
      add(map,'sign',688,440);add(map,'sign',784,832);
    } else if(map.id==='survival') {
      map.paths=[{x:1216,y:288,width:160,height:800},{x:192,y:896,width:1952,height:128}];
      add(map,'center',1188,16);
      for(const [x,y] of [[608,544],[1824,544],[608,1312],[1824,1312]]) {
        row(map,x,y,3);add(map,'rock',x+48,y+168);
      }
      row(map,960,64,3);row(map,1440,64,3);
      add(map,'sign',1152,320);add(map,'flowers',1376,304);
    } else {
      map.paths=[{x:320,y:576,width:1728,height:96},{x:352,y:448,width:128,height:608},
        {x:896,y:352,width:128,height:864},{x:1504,y:576,width:128,height:704}];
      const cave=map.biome==='cave', forest=map.biome==='forest';
      row(map,128,80,32,cave?'caveRock':'tree');
      row(map,128,1376,32,cave?'caveRock':'tree');
      for(const x of [128,2240])for(let y=240;y<1376;y+=128)add(map,cave?'caveRock':'tree',x,y);
      // Each barrier leaves wide links into all encounter clearings and the return NPC.
      for(const x of [736,1280,1792]) {
        row(map,x,672,forest?5:3,cave?'caveRock':forest?'pine':'tree');
        if(forest||cave)row(map,x,160,3,cave?'caveRock':'tree');
      }
      for(const [x,y] of [[640,1120],[1120,1088],[1792,416]])add(map,cave?'caveRock':'rock',x,y);
      add(map,'sign',304,608);
      if(!cave)for(const [x,y] of [[512,544],[1024,672],[1664,1088]])add(map,'flowers',x,y);
    }
  }
})();
