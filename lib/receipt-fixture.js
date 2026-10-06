'use strict';
// Artificial test image. Never contains a customer's receipt or personal data.
const zlib=require('node:zlib');
const font={
 '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[30,1,1,14,1,1,30],'4':[2,6,10,18,31,2,2],'5':[31,16,16,30,1,1,30],'6':[14,16,16,30,17,17,14],'7':[31,1,2,4,8,8,8],'8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,1,14],
 'A':[14,17,17,31,17,17,17],'B':[30,17,17,30,17,17,30],'C':[14,17,16,16,16,17,14],'D':[30,17,17,17,17,17,30],'E':[31,16,16,30,16,16,31],'F':[31,16,16,30,16,16,16],'I':[14,4,4,4,4,4,14],'K':[17,18,20,24,20,18,17],'L':[16,16,16,16,16,16,31],'M':[17,27,21,21,17,17,17],'O':[14,17,17,17,17,17,14],'P':[30,17,17,30,16,16,16],'R':[30,17,17,30,20,18,17],'S':[15,16,16,14,1,1,30],'T':[31,4,4,4,4,4,4],'V':[17,17,17,17,17,10,4],'W':[17,17,17,21,21,21,10],'Y':[17,17,10,4,4,4,4],'-':[0,0,0,31,0,0,0],' ':[0,0,0,0,0,0,0]
};
function fixture(){
 const width=600,height=490,scale=3,rowSize=width*3+1,raw=Buffer.alloc(rowSize*height,255);
 for(let y=0;y<height;y++)raw[y*rowSize]=0;
 const lines=['VERIFY MART','RECEIPT','2026-10-06','','APPLE 2 2000 4000','WATER 1 1500 1500','','TOTAL KRW 5500'];
 lines.forEach((line,n)=>{let left=36;for(const letter of line){const rows=font[letter]||font[' '];for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(rows[y]&(1<<(4-x)))for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++){const offset=(36+n*48+y*scale+sy)*rowSize+1+(left+x*scale+sx)*3;raw[offset]=raw[offset+1]=raw[offset+2]=20;}left+=6*scale;}});
 const crc=b=>{let v=-1;for(const x of b){v^=x;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return(v^-1)>>>0;};
 const chunk=(type,data)=>{const t=Buffer.from(type),size=Buffer.alloc(4),check=Buffer.alloc(4);size.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([size,t,data,check]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
 return {image:'data:image/png;base64,'+png.toString('base64'),expected:{merchant:'VERIFY MART',total:5500,itemTotals:[4000,1500]},png};
}
function assertResult(result){const r=result.result;return !!(result.response_id&&r&&/VERIFY/i.test(r.merchant)&&r.currency==='KRW'&&r.total_amount===5500&&r.items.length===2&&[...r.items.map(x=>x.line_total)].sort((a,b)=>a-b).join(',')==='1500,4000');}
module.exports={fixture,assertResult};
