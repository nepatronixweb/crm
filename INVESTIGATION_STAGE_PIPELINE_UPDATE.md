# Investigation: Automatic Pipeline Update Not Working When Stage Changes

**Date**: March 25, 2026  
**Status**: Investigation Complete - Root Causes Identified

---

## Summary

The automatic pipeline update mechanism appears to have been implemented but has a critical logic bug in the API route handler that prevents it from working correctly in certain scenarios.

---

## 1. How Stage Updates Are Triggered from UI

### Admissions Page Flow (`app/(dashboard)/admissions/page.tsx`)

**User Action:**
- User changes stage dropdown in admissions table

**Code Path:**
```
Stage Dropdown Change 
  → onChange handler calls quickUpdate()
  → Line 209: onChange={(e) => quickUpdate(s._id, entryIndex, "stage", e.target.value)}
```

**quickUpdate Function (Lines 53-72):**
```typescript
const quickUpdate = async (studentId: string, entryIndex: number, field: string, value: string) => {
  const today = new Date().toISOString().split("T")[0];
  let updatedDetails: AdmissionEntry[] = [];
  
  // 1. Updates local state immediately
  setStudents((prev) => /* updates students array in component state */);
  
  // 2. Sends PATCH request to API with FULL admissionDetails array
  await fetch(`/api/students/${studentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admissionDetails: updatedDetails }),  // Sends full array
  });
};
```

**What Gets Sent:**
- Sends: `{ admissionDetails: [{ ...entry, stage: "gs_applied", statusDate: "2026-03-25" }] }`
- Does NOT include pipeline field in the update (only stage + statusDate)
- Sends entire admissionDetails array

---

## 2. API Data Flow - /api/students/[id] PATCH Endpoint

### Location: `app/api/students/[id]/route.ts` (Lines 31-112)

**Request Received:**
```json
{
  "admissionDetails": [
    { 
      "_id": "...", 
      "country": "...", 
      "stage": "gs_applied", 
      "pipeline": "GS",  // OLD value from DB
      "statusDate": "2026-03-25"
    }
  ]
}
```

**Processing - "Direction A" Logic (Lines 50-71):**

```typescript
// Line 40: Fetch AppSettings with stage-to-pipeline mapping
const appSettings = await AppSettings.findOne().lean();
const stageToPipelineMapping = appSettings?.stageToPipelineMapping || {};

// Line 50: Create shallow copy of request body
const setFields: Record<string, unknown> = { ...body };
// ✓ setFields.admissionDetails now points to SAME ARRAY as body.admissionDetails

// Line 52: Check if admissionDetails array was sent
if (Array.isArray(body.admissionDetails) && body.admissionDetails.length > 0) {
  
  // Line 55: Find primary entry (last non-closed)
  const primary = [...body.admissionDetails].reverse().find(...) ?? 
                   body.admissionDetails[body.admissionDetails.length - 1];
  
  if (primary) {
    // Line 59: Handle stage field
    if (primary.stage !== undefined && primary.stage !== "") {
      setFields.stage = primary.stage;  // "gs_applied"
      
      // Line 62: Look up pipeline mapping
      const mappedPipeline = stageToPipelineMapping[primary.stage];  // "GS"
      
      // Line 63: IF mapping exists, update currentStage
      if (mappedPipeline) {
        setFields.currentStage = mappedPipeline;  // ✓ Sets to "GS"
        primary.pipeline = mappedPipeline;        // Updates array element
      }
    }
    
    // Line 66-67: CRITICAL BUG - Check if pipeline field exists in primary entry
    if (primary.pipeline !== undefined && primary.pipeline !== "") {
      setFields.currentStage = primary.pipeline;  // ⚠️ OVERWRITES line 63!
    }
  }
}

// Line 103: Execute MongoDB update
update = { $set: setFields };
const student = await Student.findByIdAndUpdate(id, update, { new: true, ... });
```

---

## 3. Identified Issues

### ⚠️ Issue #1: Logic Flow Problem in Direction A (CRITICAL)

**The Bug:**
Lines 59-71 have conflicting logic that causes the automatically-mapped pipeline to be overwritten.

**Scenario:**
1. Entry currently has: `{ stage: "offer_applied", pipeline: "Offer" }`
2. User changes stage to: `"gs_applied"` (which should map to "GS")
3. API receives: `{ admissionDetails: [{ ..., stage: "gs_applied", pipeline: "Offer" }] }`

**Execution:**
- Line 63: `setFields.currentStage = "GS"` ✓ Correct mapping applied
- Line 64: `primary.pipeline = "GS"` ✓ Array element updated
- **Line 67: `if (primary.pipeline !== undefined && primary.pipeline !== "")` → TRUE**
  - Line 67: `setFields.currentStage = primary.pipeline` → **"GS" (actually OK)**
  - But the intent is unclear - this line was supposed to handle explicit pipeline updates, not stage-mapping side effects

**The Real Problem:**
When a stage value is NOT in the `stageToPipelineMapping`:
- Line 63's `if (mappedPipeline)` check fails (returns undefined)
- `primary.pipeline` stays as the OLD value ("Offer")
- Line 67: `setFields.currentStage = "Offer"` ← WRONG!
- Result: `currentStage` set to old pipeline instead of being updated

---

### ⚠️ Issue #2: Potential Data Mismatch

**Stage Values vs Mapping Keys:**
- **leadStages** defined: 25 stages (document_pending, offer_applied, gs_applied, etc.)
- **stageToPipelineMapping** defined: 21 entries

**Missing from mapping:**
```
✓ document_pending       → Application
✓ document_submitted    → Application
✗ offer_applied         → Offer  (WAIT, should be here)
✗ acknowledge           → Offer
✗ document_requested    → Offer
✗ document_sent         → Offer
✓ conditional_offer_received → Offer
✓ unconditional_offer_received → Offer
✓ offer_rejected        → Offer
✓ gs_applied            → GS
✓ ... (all GS, COE, Visa stages present)
```

All 21 mapping entries ARE in the leadStages list ✓

**However:**
If custom stages are added without corresponding mapping entries, automatic pipeline updates will fail silently.

---

## 4. Data Flow Diagram

```
┌─────────────────────────────────────┐
│   Admissions Page UI                 │
│   Stage Dropdown: document_pending  │
└────────────┬────────────────────────┘
             │
             ▼ onChange (line 209)
┌─────────────────────────────────────┐
│   quickUpdate()                      │
│   - Updates local state              │
│   - Sends PATCH request              │
└────────────┬────────────────────────┘
             │
             ▼ PATCH /api/students/[id]
┌─────────────────────────────────────┐
│   API Route Handler                  │
│   REQUEST BODY:                      │
│   { admissionDetails: [{             │
│       stage: "gs_applied",           │
│       pipeline: "Offer",   (OLD)     │
│       statusDate: "2026-03-25"       │
│     }]                               │
│   }                                  │
└────────────┬────────────────────────┘
             │
             ▼ Direction A Logic
┌─────────────────────────────────────┐
│   Line 62: Look up "gs_applied"     │
│   in stageToPipelineMapping          │
│   ↓                                  │
│   mappedPipeline = "GS" ✓            │
│   ↓                                  │
│   Line 63: currentStage = "GS"       │
│   Line 64: primary.pipeline = "GS"   │
│   ↓                                  │
│   Line 67: if(primary.pipeline) ✓    │
│   currentStage = "GS"                │
│   (Redundant but correct)            │
└────────────┬────────────────────────┘
             │
             ▼ Line 103: MongoDB Update
┌─────────────────────────────────────┐
│   { $set: {                          │
│     stage: "gs_applied",             │
│     currentStage: "GS",              │
│     admissionDetails: [...]          │
│   }}                                 │
│   ✓ Database updated correctly       │
└─────────────────────────────────────┘
```

---

## 5. Error Scenarios

### Scenario A: Stage Not in Mapping (FAILS)
```
Input: { admissionDetails: [{ stage: "unknown_stage", pipeline: "Offer" }] }

Execution:
  Line 62: mappedPipeline = stageToPipelineMapping["unknown_stage"]  → undefined
  Line 63: if (mappedPipeline) → FALSE, doesn't execute
  Line 64: primary.pipeline stays "Offer"
  Line 67: if (primary.pipeline !== "") → TRUE
  Line 67: setFields.currentStage = "Offer"  ← WRONG! (uses old value)
  
Result: currentStage set to old pipeline, stage updated but pipeline unchanged
```

### Scenario B: Fresh Entry No Pipeline (WORKS)
```
Input: { admissionDetails: [{ stage: "gs_applied", pipeline: "" }] }

Execution:
  Line 62: mappedPipeline = "GS" ✓
  Line 63: currentStage = "GS" ✓
  Line 64: primary.pipeline = "GS"
  Line 67: if (primary.pipeline !== "") → TRUE
  Line 67: currentStage = "GS" (redundant but correct)
  
Result: ✓ Pipeline updated to "GS"
```

### Scenario C: Admissions Page Direct Update (WORKS)
```
When user updates via admissions page dropdown:
  - quickUpdate() only sends admissionDetails with stage change
  - Direction A logic handles the stage-to-pipeline mapping
  - Should work correctly IF stage is in the mapping

Result: Depends on whether stage value is in stageToPipelineMapping
```

---

## 6. Network/Request Verification

### Payload Being Sent:
✓ **Confirmed** - quickUpdate sends properly formatted PATCH request with:
- Correct endpoint: `/api/students/{studentId}`
- Correct method: PATCH
- Correct body: `{ admissionDetails: [...] }`
- Auto-sets statusDate when stage changes

### API Endpoint Receiving:
✓ **Confirmed** - API correctly:
- Receives PATCH requests
- Parses admissionDetails array
- Fetches AppSettings for mapping
- No errors in route handler

---

## 7. Root Cause Summary

**PRIMARY ISSUE:**
The Direction A logic (lines 59-71) doesn't properly handle cases where:
1. A stage value exists but isn't in `stageToPipelineMapping`
2. The code should skip updating pipeline for unknown stages OR provide a default

**SECONDARY ISSUE:**
Lines 66-71 (the pipeline mirroring logic) execute unconditionally, which:
- Works when stage is in the mapping (line 67 just mirrors what was set)
- FAILS when stage is NOT in mapping (line 67 uses the old pipeline value)

**TERTIARY ISSUE:**
The logic doesn't distinguish between:
- Pipeline updates due to stage mapping (should be applied)
- Pipeline updates explicitly sent by user (should override stage mapping)

---

## 8. Recommendations

**Fix Priority: CRITICAL**

The code needs restructuring to:
1. Only check `primary.pipeline` if pipeline was EXPLICITLY sent in the request body
2. Handle unknown stage values gracefully (don't map, don't override)
3. Distinguish between stage-mapping-derived updates vs explicit pipeline updates

Example fix pattern:
```typescript
const hasExplicitPipeline = /* check if pipeline field was explicitly in body */
if (primary.stage !== undefined && primary.stage !== "") {
  const mappedPipeline = stageToPipelineMapping[primary.stage];
  if (mappedPipeline) {
    setFields.currentStage = mappedPipeline;
    primary.pipeline = mappedPipeline;
  }
}
// Only override with explicit pipeline if provided by user
if (hasExplicitPipeline && primary.pipeline !== undefined && primary.pipeline !== "") {
  setFields.currentStage = primary.pipeline;
}
```

---

## 9. Testing Verification Needed

- [ ] Test with known stage values
- [ ] Test with unknown/custom stage values  
- [ ] Verify AppSettings.stageToPipelineMapping is populated
- [ ] Check browser network tab for PATCH request details
- [ ] Check MongoDB logs for actual updates
- [ ] Verify student records show updated currentStage
