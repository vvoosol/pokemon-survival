const fs=require('node:fs');
class MarshalReader {
  constructor(buffer){this.b=buffer;this.p=2;this.symbols=[];this.objects=[];if(buffer[0]!==4||buffer[1]!==8)throw Error('Not Ruby Marshal 4.8');}
  int(){let c=this.b.readInt8(this.p++);if(!c)return 0;if(c>4)return c-5;if(c< -4)return c+5;let n=c<0?-1:0;for(let i=0;i<Math.abs(c);i++)n=(n&~(255<<(i*8)))|(this.b[this.p++]<<(i*8));return n;}
  bytes(){const n=this.count();if(this.p+n>this.b.length)throw Error('Truncated Marshal data');const v=this.b.subarray(this.p,this.p+n);this.p+=n;return v;}
  count(){const n=this.int();if(n<0||n>this.b.length)throw Error('Invalid Marshal length');return n;}
  link(list){const n=this.int();if(n<0||n>=list.length)throw Error('Invalid Marshal reference');return list[n];}
  read(){const type=String.fromCharCode(this.b[this.p++]);let v,n;
    switch(type){
      case '0':return null;case 'T':return true;case 'F':return false;case 'i':return this.int();
      case ':':v=this.bytes().toString('utf8');this.symbols.push(v);return v;
      case ';':return this.link(this.symbols);case '@':return this.link(this.objects);
      case '"':v=this.bytes().toString('utf8');this.objects.push(v);return v;
      case '[':v=[];this.objects.push(v);n=this.count();while(n--)v.push(this.read());return v;
      case '{':case '}':v=Object.create(null);this.objects.push(v);n=this.count();while(n--){const k=this.read();v[k]=this.read();}if(type==='}')v.$default=this.read();return v;
      case 'o':v=Object.assign(Object.create(null),{$class:this.read()});this.objects.push(v);n=this.count();while(n--){const k=this.read();v[k.replace(/^@/,'')]=this.read();}return v;
      case 'I':v=this.read();n=this.count();while(n--){this.read();this.read();}return v;
      case 'u':{const name=this.read(),data=this.bytes();v={$class:name};this.objects.push(v);if(name==='Table'){if(data.length<20||data.length!==20+data.readInt32LE(16)*2)throw Error('Invalid RGSS Table');v.dim=data.readInt32LE(0);v.x=data.readInt32LE(4);v.y=data.readInt32LE(8);v.z=data.readInt32LE(12);v.values=[];for(let i=20;i<data.length;i+=2)v.values.push(data.readInt16LE(i));}else v.raw=data.toString('base64');return v;}
      case 'f':v=Number(this.bytes().toString());this.objects.push(v);return v;
      default:throw Error(`Unsupported Marshal ${type} at ${this.p-1}`);
    }
  }
}
function decode(buffer){const reader=new MarshalReader(buffer);const value=reader.read();if(reader.p!==buffer.length)throw Error('Trailing Marshal data');return value;}
module.exports={decode,read:file=>decode(fs.readFileSync(file))};
