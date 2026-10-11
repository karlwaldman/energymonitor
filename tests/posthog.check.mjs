import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capturePublicPageview } from '../src/lib/posthog.ts';

const context = { hostname: 'energy-monitor.app', pathname: '/', referrer: 'https://example.com/private?secret=value', distinctId: 'random-page-id' };
// Real outbound request inspection; no mocks at the capture call site.
test('posts sanitized cookieless pageviews', async () => {
 const requests=[];
 assert.equal(await capturePublicPageview(' public-write-token ',context,async (...args)=>{requests.push(args);return {ok:true}}),'sent');
 const [url,request]=requests[0]; const body=JSON.parse(request.body);
 assert.equal(url,'https://us.i.posthog.com/i/v0/e/');
 assert.equal(request.credentials,'omit'); assert.equal(request.keepalive,true);
 assert.equal(body.event,'$pageview'); assert.equal(body.properties.$pathname,'/');
 assert.equal(body.properties.$referring_domain,'example.com');
 assert.equal(body.properties.$process_person_profile,false);
 assert.doesNotMatch(request.body,/private@example|secret=value|#token/);
});
test('no production capture for DNT, GPC, preview, missing config or private/new routes', async()=>{
 let sends=0;const send=async()=>{sends++;return {ok:true}};
 for(const override of [{doNotTrack:'1'},{globalPrivacyControl:true},{hostname:'localhost'},{hostname:'preview.vercel.app'},{pathname:'/dashboard'},{pathname:'/auth/callback'},{pathname:'/api/keys'},{pathname:'/account/invoices'},{pathname:'/future-private-route'}]) {
  assert.equal(await capturePublicPageview('token',{...context,...override},send),'disabled');
 }
 assert.equal(await capturePublicPageview('',context,send),'disabled');assert.equal(sends,0);
});
test('non-2xx and network failures do not break browsing',async()=>{
 assert.equal(await capturePublicPageview('token',context,async()=>({ok:false})),'failed');
 assert.equal(await capturePublicPageview('token',context,async()=>{throw new Error('timeout')}),'failed');
});
test('smoke events carry automation exclusion',async()=>{
 let body;await capturePublicPageview('token',{...context,automation:true},async(_,request)=>{body=JSON.parse(request.body);return {ok:true}});
 assert.equal(body.properties.traffic_type,'automation');
});

test('actual HTTP intake receives one sanitized event and rejects failed delivery', async () => {
 const received=[];let status=200;
 const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;received.push(JSON.parse(raw));res.writeHead(status);res.end('{}');});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const endpoint=`http://127.0.0.1:${server.address().port}/capture`;
 const send=(_url,init)=>fetch(endpoint,init);
 try {
  assert.equal(await capturePublicPageview('public-write-token',{...context,pathname:'/'},send),'sent');
  assert.equal(received.length,1);assert.equal(received[0].event,'$pageview');
  assert.equal(received[0].properties.$current_url,`https://${context.hostname}/`);
  assert.doesNotMatch(JSON.stringify(received[0]),/private@example|secret=value|#token/);
  status=503;assert.equal(await capturePublicPageview('public-write-token',{...context,pathname:'/'},send),'failed');
 } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});
