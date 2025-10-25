import { LocalStorage } from "./storage.js";
import { hash } from "./auth.js";

const store = new LocalStorage();
await store.init();

const users = await store.listUsers();
if (users.length) {
  console.log("Users exist -> skip seeding");
  process.exit(0);
}
// IDs U-2550 ff
const base = 2550;
const seed = [
  { vorname:"Admin", nachname:"System", benutzer:"admin", passwort:"3333", rolle:"Administrator" },
  { vorname:"Hans",  nachname:"Muster", benutzer:"user1", passwort:"1111", rolle:"User" },
  { vorname:"Anna",  nachname:"Beispiel", benutzer:"user2", passwort:"2222", rolle:"User" }
];
const rows = seed.map((u,i)=>({
  iduser:`U-${base+i}`,
  vorname:u.vorname, nachname:u.nachname,
  strasse:"Hauptstrasse 1", PLZ:"7000", ort:"Chur",
  email:`${u.benutzer}@example.com`, handy:"+41790000000",
  benutzer:u.benutzer, passhash: hash(u.passwort),
  beruf:"-", arbeitsort:"-", funktion:"-",
  rolle:u.rolle
}));

await store.saveUsers(rows);
console.log("Seeded users:", rows.map(x=>`${x.benutzer}/${x.iduser}`).join(", "));
