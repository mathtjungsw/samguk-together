import * as d3 from 'd3';
import {MAP,COLORS,placeInfo,capacityOf} from './engine.js';

export class TerritoryMap {
  constructor(container,onSelect){this.container=container;this.onSelect=onSelect;this.svg=d3.select(container.querySelector('svg'));this.zoom=d3.zoomIdentity;this.world=null;this.uid=null;this.source=null;this.target=null;this.width=0;this.height=0;this.layoutById=new Map(MAP.layout.cells.map(c=>[c.id,c]));this.land=structuredClone(MAP.land);if(d3.geoArea(this.land)>2*Math.PI)this.land.geometry.coordinates.forEach(p=>p.forEach(r=>r.reverse()));
    this.zoomBehavior=d3.zoom().scaleExtent([1,4]).on('zoom',event=>{this.zoom=event.transform;this.geography?.attr('transform',this.zoom);this.labels();});
    container.querySelector('[data-zoom="in"]').onclick=()=>this.svg.call(this.zoomBehavior.scaleBy,1.4);
    container.querySelector('[data-zoom="out"]').onclick=()=>this.svg.call(this.zoomBehavior.scaleBy,1/1.4);
    container.querySelector('[data-zoom="all"]').onclick=()=>this.svg.call(this.zoomBehavior.transform,d3.zoomIdentity);
    this.observer=new ResizeObserver(()=>this.build());this.observer.observe(container.querySelector('.map-viewport'));this.build();
  }
  build(){const viewport=this.container.querySelector('.map-viewport'),width=Math.round(viewport.clientWidth),height=Math.round(viewport.clientHeight);if(width<100||height<100||width===this.width&&height===this.height)return;this.width=width;this.height=height;
    this.svg.attr('viewBox',`0 0 ${width} ${height}`).selectAll('*').remove();this.svg.append('title').text('삼국 90개 영토 지도');
    this.projection=d3.geoConicConformal().parallels([25,40]).rotate([-110,0]).fitExtent([[16,15],[width-15,height-12]],this.land);const path=d3.geoPath(this.projection),ratio=this.projection.scale()/MAP.layout.projection.scale,current=this.projection.translate(),original=MAP.layout.projection.translate;
    const adapt=xy=>[(xy[0]-original[0])*ratio+current[0],(xy[1]-original[1])*ratio+current[1]];
    this.cells=MAP.places.map(p=>({...p,polygon:this.layoutById.get(p.id).polygon.map(adapt),point:this.projection(p.coord)}));
    this.svg.append('defs').append('clipPath').attr('id','game-land-clip').append('path').attr('d',path(this.land));this.geography=this.svg.append('g');this.geography.append('path').attr('d',path(this.land)).attr('fill','#e1e6d7').attr('stroke','#a6b29d').attr('stroke-width',1);
    const regionLayer=this.geography.append('g').attr('clip-path','url(#game-land-clip)');
    this.regions=regionLayer.selectAll('a').data(this.cells,p=>p.id).join('a').attr('href','#').attr('role','button').attr('class','territory-link').on('click',(event,p)=>{event.preventDefault();this.onSelect(p.id);}).on('keydown',(event,p)=>{if(event.key===' '){event.preventDefault();this.onSelect(p.id);}});
    this.regions.append('path').attr('class','territory-shape').attr('d',p=>'M'+p.polygon.map(v=>v.join(',')).join('L')+'Z');
    this.nodes=this.geography.append('g').attr('pointer-events','none').selectAll('g').data(this.cells).join('g').attr('transform',p=>`translate(${p.point[0]},${p.point[1]})`);
    this.nodes.append('circle').attr('class','node-circle').attr('r',p=>p.major?4.4:2.7);
    this.svg.append('g').attr('class','map-label-layer').attr('pointer-events','none');
    this.zoomBehavior.extent([[0,0],[width,height]]).translateExtent([[-width*.2,-height*.2],[width*1.2,height*1.2]]);this.svg.call(this.zoomBehavior).call(this.zoomBehavior.transform,d3.zoomIdentity);this.paint();
  }
  setWorld(world,uid,source,target){this.world=world;this.uid=uid;this.source=source;this.target=target;this.paint();}
  paint(){if(!this.world||!this.regions)return;const sourceTerritory=this.world.territories[this.source];const neighbors=new Set(sourceTerritory?.owner===this.uid?this.layoutById.get(this.source)?.neighbors:[]);
    this.regions.attr('aria-label',p=>{const t=this.world.territories[p.id],owner=this.world.players[t.owner]?.name||'중립';return `${p.ko}, ${owner}, 병력 ${t.units.length}/${capacityOf(p.id)}명${neighbors.has(p.id)?', 인접 영토':''}`;}).classed('is-source',p=>p.id===this.source).classed('is-target',p=>p.id===this.target).classed('is-adjacent',p=>neighbors.has(p.id));
    this.regions.select('path').attr('fill',p=>{const t=this.world.territories[p.id];return t.owner?COLORS[this.world.players[t.owner]?.color||0]:p.rank==='citadel'?'#e3d9c5':p.rank==='stronghold'?'#dce3cf':'#e2e8d8';});
    this.nodes.select('circle').attr('fill',p=>{const t=this.world.territories[p.id];return t.owner?COLORS[this.world.players[t.owner]?.color||0]:'#74836b';}).attr('r',p=>p.id===this.source||p.id===this.target?5.8:p.major?4.4:2.7);
    this.labels();
  }
  labels(){if(!this.cells||!this.world)return;const width=this.width,height=this.height,k=this.zoom.k;const priority=new Set([this.source,this.target]);const anchors=new Set(['luoyang','changan','chengdu','jianye','xiangyang','hanzhong','wuwei','xiangping','changsha','wu','shouchun','yunnan','nanpi','ye']);
    const candidates=this.cells.filter(p=>priority.has(p.id)||k>1.7||p.major&&(width>620||anchors.has(p.id))).sort((a,b)=>Number(priority.has(b.id))-Number(priority.has(a.id))||Number(this.world.territories[b.id].owner===this.uid)-Number(this.world.territories[a.id].owner===this.uid)||Number(b.major)-Number(a.major));
    const occupied=[],visible=[];
    for(const p of candidates){const [px,py]=p.point,x=px*k+this.zoom.x,y=py*k+this.zoom.y;if(x<8||x>width-8||y<10||y>height-8)continue;const count=this.world.territories[p.id].units.length,label=p.ko+' '+count,w=p.ko.length*11+String(count).length*7+13,h=15;for(const pos of [{x,y:y-10,anchor:'middle'},{x:x+9,y:y+4,anchor:'start'},{x:x-9,y:y+4,anchor:'end'},{x,y:y+19,anchor:'middle'}]){const b={x:pos.x-(pos.anchor==='middle'?w/2:pos.anchor==='end'?w:0),y:pos.y-h,w,h:h+3};if(b.x<3||b.x+b.w>width-3||b.y<3||b.y+b.h>height-3||occupied.some(a=>b.x<a.x+a.w+2&&b.x+b.w+2>a.x&&b.y<a.y+a.h+2&&b.y+b.h+2>a.y))continue;occupied.push(b);visible.push({...p,pos,label});break;}}
    this.svg.select('.map-label-layer').selectAll('text').data(visible,p=>p.id).join('text').attr('class',p=>'map-place-label '+(priority.has(p.id)?'priority':'')).attr('x',p=>p.pos.x).attr('y',p=>p.pos.y).attr('text-anchor',p=>p.pos.anchor).text(p=>p.label);
    this.container.querySelector('[data-map-zoom]').textContent=Math.round(k*100)+'%';
  }
}
