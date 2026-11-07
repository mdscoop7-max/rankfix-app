import test from "node:test";
import assert from "node:assert/strict";
import {classifyLoginInfrastructureFailure} from "../lib/login-infrastructure.ts";

test("Neon quota error is identified by SQLSTATE even with generic text",()=>{
 const err=Object.assign(new Error("Your account or project has exceeded the quota. Upgrade your plan to increase limits."),{code:"53000"});
 assert.equal(classifyLoginInfrastructureFailure(err),"quota");
 assert.equal(classifyLoginInfrastructureFailure(Object.assign(new Error("database failed"),{code:"53000"})),"quota");
});
test("quota errors wrapped in a cause are detected",()=>{
 assert.equal(classifyLoginInfrastructureFailure({message:"query failed",cause:{code:"53000",message:"insufficient resources"}}),"quota");
});
test("network and configuration faults are infrastructure issues",()=>{
 assert.equal(classifyLoginInfrastructureFailure(new Error("DATABASE_URL ontbreekt.")),"database_unavailable");
 assert.equal(classifyLoginInfrastructureFailure(Object.assign(new Error("query failed"),{code:"08006"})),"database_unavailable");
});
test("wrong passwords, rate limiting and website errors do not masquerade as database quotas",()=>{
 assert.equal(classifyLoginInfrastructureFailure(new Error("Invalid credentials")),null);
 assert.equal(classifyLoginInfrastructureFailure(new Error("Too many login attempts")),null);
 assert.equal(classifyLoginInfrastructureFailure(new Error("Website HTTP 402")),null);
});
