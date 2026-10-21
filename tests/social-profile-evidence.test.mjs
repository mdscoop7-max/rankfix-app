import test from "node:test";
import assert from "node:assert/strict";
import { officialSocialProfileLinks } from "../lib/social-profile-evidence.ts";

test("German company footer social profiles are evidence even when body text has no platform names",()=>{
 const html=`<html><body><main>Technik und Innovation</main>
 <footer><a href="https://www.linkedin.com/company/example-technologies/">Profil</a>
 <a title="Kanal" href="https://www.youtube.com/@exampletech">Zum Kanal</a>
 <a href='https://www.instagram.com/exampletech/'>Social</a>
 <a href="https://www.facebook.com/exampletech/">Profil</a></footer></body></html>`;
 assert.equal(officialSocialProfileLinks(html).length,4);
});
test("Unrelated article mentions and social share widgets are not official profiles",()=>{
 const html=`<html><body><a href="https://www.linkedin.com/company/other/">client</a>
 <footer><a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
 <a href="https://www.linkedin.com/shareArticle?url=example">Share</a>
 <a href="https://www.youtube.com/watch?v=abc">Video</a></footer></body></html>`;
 assert.deepEqual(officialSocialProfileLinks(html),[]);
});
test("A labelled social navigation is an alternative to a footer",()=>{
 const html='<nav aria-label="Soziale Medien"><a href="https://www.linkedin.com/company/example/">Company</a></nav>';
 assert.equal(officialSocialProfileLinks(html).length,1);
});
