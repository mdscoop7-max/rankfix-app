import test from "node:test";
import assert from "node:assert/strict";
import { findCompanyRegistration } from "../lib/contact-evidence.ts";

test("VAT identifiers need numeric digits; adjacent menu labels are not company evidence",()=>{
  assert.equal(findCompanyRegistration("BTW Elektricien | Klusjesman"),null);
  assert.equal(findCompanyRegistration("VAT Contractors | Book now"),null);
  assert.equal(findCompanyRegistration("BTW Elektricien | btw-nummer: NL859472613B01"),"BTW/VAT NL859472613B01");
  assert.equal(findCompanyRegistration("BTW-nummer: DE869472613"),"BTW/VAT DE869472613");
});
