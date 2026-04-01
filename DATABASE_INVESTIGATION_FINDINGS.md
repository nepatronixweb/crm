# Database Investigation Report: Stage Values and Pipeline Mapping

**Investigation Date**: March 25, 2026
**Database Status**: CRITICAL FINDINGS

---

## FINDING #1: Database Mapping Is NOT Populated

### Current State in MongoDB:
```
AppSettings.stageToPipelineMapping = {} (EMPTY - 0 entries)
```

### Expected in Code (AppSettings Model Default):
```typescript
stageToPipelineMapping: {
  "document_pending": "Application",
  "document_submitted": "Application",
  "offer_applied": "Offer",
  "acknowledge": "Offer",
  "document_requested": "Offer",
  "document_sent": "Offer",
  "conditional_offer_received": "Offer",
  "unconditional_offer_received": "Offer",
  "offer_rejected": "Offer",
  "gs_applied": "GS",
  "gs_additional_doc_requested": "GS",
  "gs_additional_doc_sent": "GS",
  "gs_approved": "GS",
  "gs_rejected": "GS",
  "coe_applied": "COE",
  "coe_additional_doc_requested": "COE",
  "coe_additional_doc_sent": "COE",
  "coe_received": "COE",
  "coe_rejected": "COE",
  "coe_withdrawn": "COE",
  "visa_applied": "Visa",
  "visa_grant": "Visa",
  "visa_reject": "Visa",
  "visa_invalid": "Visa",
  "visa_withdrawn": "Visa",
}
```

**Total Expected Mappings**: 25 entries
**Total Actual Mappings**: 0 entries
**Status**: ❌ CRITICAL - No automatic pipeline mapping possible

---

## FINDING #2: Stage Value Format Mismatch in Database

### Actual Stage Value Stored:
```
"gsapplied" (lowercase, no underscore)
```

### Expected Format (per model/code):
```
"gs_applied" (lowercase with underscore)
```

### Database Report:
- **Unique stage values found**: 1
- **Value**: `"gsapplied"` (appears in 1 record)
- **Format**: ❌ Incorrect (missing underscore)
- **In mapping**: ❌ NO (because mapping is empty AND format is wrong)

### Sample Record:
```json
{
  "name": "TEST Nandita Shrestha",
  "admissionDetails": [
    {
      "stage": "gsapplied",           // Wrong format!
      "pipeline": "Application",      // Current value
      "statusDate": "2026-03-23"
    }
  ]
}
```

---

## FINDING #3: "Offer Applied" Records - Not Found

### Search Results:
```
Pattern searched: ".*[Oo]ffer.*[Aa]pplied.*"
Records found: 0
```

**Status**: ℹ️ No records with "Offer Applied" stage in database
- The expected stage value is `"offer_applied"` (with underscore)
- No student records have this stage in their admissionDetails

---

## FINDING #4: Missing Expected Stages

### All Lead Stages Defined in Code:
25 stages defined in AppSettings model, including:
```
1. document_pending → "Document Pending"
2. document_submitted → "Document Submitted"
3. offer_applied → "Offer Applied"
4. acknowledge → "Acknowledge"
5. document_requested → "Document Requested"
6. document_sent → "Document Sent"
7. conditional_offer_received → "Conditional Offer Received"
8. unconditional_offer_received → "Unconditional Offer Received"
9. offer_rejected → "Offer Rejected"
10. gs_applied → "GS Applied"
11. gs_additional_doc_requested → "GS Additional Doc Requested"
12. gs_additional_doc_sent → "GS Additional Doc Sent"
13. gs_approved → "GS Approved"
14. gs_rejected → "GS Rejected"
15. coe_applied → "COE Applied"
16. coe_additional_doc_requested → "COE Additional Doc Requested"
17. coe_additional_doc_sent → "COE Additional Doc Sent"
18. coe_received → "COE Received"
19. coe_rejected → "COE Rejected"
20. coe_withdrawn → "COE Withdrawn"
21. visa_applied → "Visa Applied"
22. visa_grant → "Visa Grant"
23. visa_reject → "Visa Reject"
24. visa_invalid → "Visa Invalid"
25. visa_withdrawn → "Visa Withdrawn"
```

### Stages Actually in Database:
```
Only: "gsapplied" (malformed)
```

**Status**: ⚠️ Data inconsistency
- Database has incomplete/malformed stage data
- No records using proper stage format with underscores
- No "Offer Applied" or other expected stages found

---

## FINDING #5: Impact on Automatic Pipeline Updates

### When User Changes Stage (Current Broken Flow):

**Code Path in `/api/students/[id]` PATCH handler (Line 40):**
```typescript
const stageToPipelineMapping = appSettings?.stageToPipelineMapping || {};
// stageToPipelineMapping = {} (EMPTY!)
```

**Scenario: If user tries to update to "offer_applied":**

1. Request arrives with:
   ```json
   {
     "admissionDetails": [{
       "stage": "offer_applied",
       "pipeline": "Application",    // Old value
       "statusDate": "2026-03-25"
     }]
   }
   ```

2. API tries to lookup mapping:
   ```typescript
   const mappedPipeline = stageToPipelineMapping["offer_applied"];
   // Returns: undefined (mapping is empty!)
   ```

3. Result:
   ```typescript
   if (mappedPipeline) {
     setFields.currentStage = mappedPipeline;  // ← SKIPPED
   }
   // Falls through to line 67:
   setFields.currentStage = primary.pipeline;  // Uses old "Application"
   ```

**Status**: ❌ AUTOMATIC PIPELINE UPDATES ARE BROKEN
- No mappings defined in database
- Even if stage is changed, old pipeline value is used
- New currentStage is NOT set correctly

---

## SUMMARY OF FINDINGS

| Finding | Issue | Impact |
|---------|-------|--------|
| #1 | stageToPipelineMapping is empty in DB | ❌ No automatic pipeline mapping possible |
| #2 | Stage value "gsapplied" format wrong | ❌ Doesn't match mapping keys (should be "gs_applied") |
| #3 | No "Offer Applied" records | ℹ️ Limited test data, but not preventing the feature from working |
| #4 | Only 1 stage value in DB vs 25 expected | ⚠️ Incomplete database data |
| #5 | Pipeline update logic relies on empty mapping | ❌ Feature is non-functional |

---

## ROOT CAUSE ANALYSIS

### Problem 1: Empty AppSettings
The `stageToPipelineMapping` was never populated when the AppSettings document was created.
- The model has defaults defined ✓
- But the database document was created with an empty mapping ✗
- This likely happened because the migration or seed script didn't initialize this field

### Problem 2: Stage Data Format
The stage value `"gsapplied"` doesn't match the expected format from the code model.
- Expected: `"gs_applied"` (snake_case)
- Actual: `"gsapplied"` (all lowercase, no underscore)
- This suggests data was entered manually or from a different system

### Problem 3: Missing Lead Stages
The Student records don't have the expected stage values at all.
- Only 1 stage in database: `"gsapplied"`
- Expected 25+ different stages as the application progresses
- This indicates limited/test data or a data migration issue

---

## WHAT NEEDS TO HAPPEN FOR THE FEATURE TO WORK

1. **Populate AppSettings.stageToPipelineMapping** with the 25 defined mappings
2. **Fix existing stage values** from `"gsapplied"` to `"gs_applied"`
3. **Add more test data** with various stage values to properly test the feature
4. **Verify the automatic update logic** works after DB is corrected

---

## COMPARISON: Expected vs Actual

### Expected Stage Format:
```
"offer_applied"      (underscore separator)
"gs_applied"         (underscore separator)
"coe_received"       (underscore separator)
```

### Actual Stage Format:
```
"gsapplied"          (NO underscore - WRONG!)
```

### Comparison to "Offer Applied":
- UI Label: "Offer Applied" (spaces)
- Code Key: "offer_applied" (underscore)
- Database Value: "gsapplied" (should match code key, but doesn't!)
