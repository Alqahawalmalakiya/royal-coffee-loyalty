// node scripts/generate-vapid.mjs
// Generates a new P-256 VAPID keypair; display output once; never commit the private JWK.
import {generateKeyPairSync} from 'node:crypto';
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const pub=publicKey.export({format:'jwk'}),priv=privateKey.export({format:'jwk'});
const raw=Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,'base64url'),Buffer.from(pub.y,'base64url')]);
console.log('VAPID_PUBLIC_KEY='+raw.toString('base64url'));
console.log('VAPID_PRIVATE_JWK='+JSON.stringify(priv));
console.log('Keep VAPID_PRIVATE_JWK secret; store it only in Cloudflare Worker secrets.');
