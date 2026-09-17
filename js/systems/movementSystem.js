window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.MovementSystem = class MovementSystem {
  static canStand(world, x, y, radius = 22) {
    if(x<radius||y<radius||x>world.width-radius||y>world.height-radius)return false;
    return !(world.colliders || []).some(box => Math.hypot(x-Math.max(box.x,Math.min(box.x+box.width,x)),
      y-Math.max(box.y,Math.min(box.y+box.height,y))) < radius);
  }

  static safePosition(world, x, y, radius = 22) {
    if(this.canStand(world,x,y,radius))return {x,y};
    for(let distance=32;distance<=256;distance+=32)for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8) {
      const point={x:x+Math.cos(angle)*distance,y:y+Math.sin(angle)*distance};
      if(this.canStand(world,point.x,point.y,radius))return point;
    }
    return null;
  }

  move(entity, x, y, dt, world, speedFactor = 1) {
    const length = Math.hypot(x, y);
    let nx = x;
    let ny = y;
    if (length > 1) {
      nx /= length;
      ny /= length;
    }
    const speed = entity.movementSpeed * speedFactor;
    entity.vx = nx;
    entity.vy = ny;
    const dx=nx*speed*dt,dy=ny*speed*dt;
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/8));
    for(let i=0;i<steps;i++) {
      const nextX=Math.max(entity.radius,Math.min(world.width-entity.radius,entity.x+dx/steps));
      if(window.SurvivorRPG.MovementSystem.canStand(world,nextX,entity.y,entity.radius))entity.x=nextX;
      const nextY=Math.max(entity.radius,Math.min(world.height-entity.radius,entity.y+dy/steps));
      if(window.SurvivorRPG.MovementSystem.canStand(world,entity.x,nextY,entity.radius))entity.y=nextY;
    }
  }

  moveToward(entity, tx, ty, dt, world, speedFactor = 1) {
    const dx = tx - entity.x;
    const dy = ty - entity.y;
    const len = Math.hypot(dx, dy) || 1;
    const direction=Math.atan2(dy,dx), lookahead=entity.radius+36;
    let angle=direction;
    if(!window.SurvivorRPG.MovementSystem.canStand(world,entity.x+dx/len*lookahead,entity.y+dy/len*lookahead,entity.radius)) {
      const side=entity.avoidanceSide || (entity.avoidanceSide=1);
      for(const turn of [0.65,1.15,1.65,2.2,-0.65,-1.15,-1.65]) {
        const candidate=direction+turn*side;
        if(window.SurvivorRPG.MovementSystem.canStand(world,entity.x+Math.cos(candidate)*lookahead,entity.y+Math.sin(candidate)*lookahead,entity.radius)) {angle=candidate;break;}
      }
    }
    this.move(entity, Math.cos(angle), Math.sin(angle), dt, world, speedFactor);
  }
};
