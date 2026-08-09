// api/scripts/fix-switchrep-null-order.mjs
// Hotfix: the SwitchRepModal received orderId={order.id}; React evaluates that
// prop while 'order' is still null during load, crashing the order page with
// "Cannot read properties of null (reading 'id')". Guard show and use order?.id.
//   git show <branch>:api/scripts/fix-switchrep-null-order.mjs > /tmp/fx.mjs && node /tmp/fx.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const d=s=>Buffer.from(s,'base64').toString('utf8');
const FILE=resolve(process.cwd(),'web/app/admin/orders/[id]/page.jsx');
if(!existsSync(FILE)){console.error('run from repo root');process.exit(1);}
let s=readFileSync(FILE,'utf8');
const o=d('ICAgICAgICA8U3dpdGNoUmVwTW9kYWwKICAgICAgICAgIHNob3c9e3Nob3dTd2l0Y2hSZXAgJiYgY2FuU3dpdGNoUmVwfQogICAgICAgICAgb25DbG9zZT17KCkgPT4gc2V0U2hvd1N3aXRjaFJlcChmYWxzZSl9CiAgICAgICAgICBvcmRlcklkPXtvcmRlci5pZH0='), n=d('ICAgICAgICA8U3dpdGNoUmVwTW9kYWwKICAgICAgICAgIHNob3c9e3Nob3dTd2l0Y2hSZXAgJiYgY2FuU3dpdGNoUmVwICYmICEhb3JkZXJ9CiAgICAgICAgICBvbkNsb3NlPXsoKSA9PiBzZXRTaG93U3dpdGNoUmVwKGZhbHNlKX0KICAgICAgICAgIG9yZGVySWQ9e29yZGVyPy5pZH0=');
const c=s.split(o).length-1;
if(c!==1){console.error('ANCHOR FAIL matched '+c+' (expected 1). If it already shows order?.id, this hotfix was applied.');process.exit(1);}
s=s.replace(o,n);
writeFileSync(FILE,s);
console.log('ok  guarded SwitchRepModal (order?.id). Rebuild frontend + restart.');
