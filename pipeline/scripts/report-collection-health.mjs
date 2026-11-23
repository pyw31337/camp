#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enrichmentGapScore } from "../lib/enrichment-priority.mjs";
const root=resolve(fileURLToPath(import.meta.url),"../../.."), dataDir=join(root,"camping-atlas/public/explore/data"), detailDir=join(dataDir,"camps");
const read=(p,d)=>{try{return JSON.parse(readFileSync(p,"utf8"));}catch{return d;}};
const arr=x=>Array.isArray(x)?x:(Array.isArray(x?.campgrounds)?x.campgrounds:[]);
const has=v=>v!=null&&v!==""&&!(Array.isArray(v)&&!v.length);
const cat=arr(read(join(dataDir,"campgrounds.json"),[])), details=new Map(cat.map(c=>[String(c.id),read(join(detailDir,`${c.id}.json`),{})]));
const social=read(join(root,"pipeline/out/campground-social.json"),{campgrounds:{}}).campgrounds??{};
const web=read(join(root,"pipeline/out/campground-web.json"),{campgrounds:{}}).campgrounds??{};
const status=read(join(root,"pipeline/registry/collection-status.json"),{sources:{}});
const scoreFile=read(join(root,"data/quality/info-score.json"),{scores:{}});
const n=cat.length, counts={card_thumbnail:0,detail_photo:0,social_record:0,social_post:0,social_image:0,social_video:0,web_record:0,web_body:0,booking:0,fee:0,checkin:0,checkout:0,homepage:0,contact:0}, gaps={}, scores=[], sparse=[];
for(const c of cat){const id=String(c.id),d=details.get(id)??{},s=social[id]??{},w=web[id]??{};const card=has(c.ph)||has(c.img)||has(c.pt?.t)||has(c.sn), detail=card||(d.photos?.length>0)||(d.photos_remote?.length>0), posts=(s.blog?.length??0)+(s.cafe?.length??0), imgs=s.image?.length??0, vids=s.vclip?.length??0, docs=w.docs?.length??0, body=Object.values(w.bodies??{}).length>0||w.docs?.some(x=>x.body?.length);
if(card)counts.card_thumbnail++;if(detail)counts.detail_photo++;if(social[id])counts.social_record++;if(posts)counts.social_post++;if(imgs)counts.social_image++;if(vids)counts.social_video++;if(docs)counts.web_record++;if(body)counts.web_body++;
if(has(c.booking?.url)||has(c.booking?.channels)||has(d.booking?.channels)||has(d.booking?.url))counts.booking++;if(has(c.fee)||has(d.prices?.length)||has(d.profile?.fields?.PRICE))counts.fee++;if(has(c.ti?.i)||has(d.profile?.fields?.CHECKIN)||has(d.spec?.fields?.CHECKIN_TIME))counts.checkin++;if(has(c.ti?.o)||has(d.profile?.fields?.CHECKOUT)||has(d.spec?.fields?.CHECKOUT_TIME))counts.checkout++;if(has(c.homepage)||has(d.homepage))counts.homepage++;if(has(c.tel)||has(d.tel)||has(d.contact?.tel))counts.contact++;
const g=enrichmentGapScore(c,d);for(const x of g.gaps)gaps[x]=(gaps[x]??0)+1;const score=Number(c.iq??scoreFile.scores?.[id]?.[0]);if(Number.isFinite(score))scores.push(score);if(g.score>=45||(Number.isFinite(score)&&score<20))sparse.push({id,name:c.name,score:Number.isFinite(score)?score:null,gap_score:g.score,gaps:g.gaps,social_age_days:g.social_age_days,web_age_days:g.web_age_days});}
const pct=x=>n?Math.round(x/n*1000)/10:0, avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100:null;
const src={};for(const [name,v] of Object.entries(status.sources??{})){const rows=Object.values(v.campgrounds??{});src[name]={last_run_at:v.last_run_at??null,searched:v.searched??null,failed:v.failed??null,calls:v.calls??null,max_calls:v.max_calls??null,tracked_camps:rows.length,error_count:rows.filter(x=>x.last_error||x.last_error_at).length,latest_errors:rows.filter(x=>x.last_error).slice(-10).map(x=>String(x.last_error).slice(0,240))};}
sparse.sort((a,b)=>b.gap_score-a.gap_score||(a.score??999)-(b.score??999));
const report={generated_at:new Date().toISOString(),catalog:{total:n,active:cat.filter(c=>c.status!=="폐업").length},coverage:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,{count:v,pct:pct(v)}])),quality:{measured:scores.length,average:avg,bands:{under20:scores.filter(x=>x<20).length,under40:scores.filter(x=>x<40).length,atLeast70:scores.filter(x=>x>=70).length}},gaps,sparse_queue:{total:sparse.length,top:sparse.slice(0,200)},sources:src,collection_policy:{allowed:["공공데이터포털·TourAPI·고캠핑","Kakao/Daum 무료 검색 API","Naver API HUB 무료 한도","robots.txt 허용 운영자 페이지","공개 YouTube 검색 메타데이터"],blocked:["로그인 필요 페이지","캡차·robots.txt 차단 페이지","유료 API 자동 호출","원문 이미지 무단 재호스팅"],strategy:"빈칸·오래된·실패 업장을 먼저 검색하고 성공한 값은 유지하며 실패 원인과 다음 시도를 기록한다."},next_actions:["사진 없음: 공식 사진→운영자 OG→검증된 후기 후보","영상 없음: 업장명 그대로 동영상 검색어","글 없음: 네이버 블로그·카페·웹문서·지식iN 무료 검색","인증·한도·robots 차단은 추정하지 않고 실패 원인 기록"]};
const out=join(root,"data/quality/collection-health.json");mkdirSync(join(root,"data/quality"),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+"\n");console.log(`수집 품질 현황: ${n}곳 · 평균 ${avg??"-"}점 · 사진 ${counts.card_thumbnail}곳 · 소셜 영상 ${counts.social_video}곳 · 보강 큐 ${sparse.length}곳`);
