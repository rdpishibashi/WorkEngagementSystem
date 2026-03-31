# Report Project Refactoring Plan

## Current Issues

1. **Missing fields in sheets**: Several calculated metrics (E_std_6, E_std_12, E_momentum_3) are not included in the output
2. **Inconsistent columns**: Individual sheets might have different structure than rating sheet
3. **Code bloat**: Unused functions and outdated logic remain in the codebase
4. **Maintenance burden**: Complex code is harder to understand and modify

## Refactoring Goals

### 1. Add Missing Fields to Output

**Fields to Add** (in order requested):
- `E_std_6` - Standard deviation over last 6 months (before V_delta_1)
- `E_std_12` - Standard deviation over last 12 months (before V_delta_1)
- `E_momentum_3` - Momentum over last 3 months (before E_slope_6)

**Note**: User requested "E_momentum_6" but the code calculates "E_momentum_3". We should:
- Option A: Keep E_momentum_3 and rename documentation
- Option B: Change calculation to use 6-month window
- **Recommendation**: Keep E_momentum_3 (matches Python implementation)

**Current field order**:
```
level, trend_base, trend_recent, trend_refined, big_change, stability_6,
strength_short, weakness_short, strength_mid, weakness_mid,
E_delta_1, E_delta_1_prev, E_delta_1_std_12,
E_slope_6, E_slope_6_std_12,
V_delta_1, D_delta_1, A_delta_1,
V_slope_6, D_slope_6, A_slope_6
```

**New field order** (21 → 24 fields):
```
level, trend_base, trend_recent, trend_refined, big_change, stability_6,
strength_short, weakness_short, strength_mid, weakness_mid,
E_delta_1, E_delta_1_prev, E_delta_1_std_12,
E_std_6, E_std_12,           ← NEW (before V_delta_1)
V_delta_1, D_delta_1, A_delta_1,
E_momentum_3, E_slope_6, E_slope_6_std_12,   ← NEW position for E_momentum_3
V_slope_6, D_slope_6, A_slope_6
```

### 2. Standardize Sheet Structures

**Target**: Make all sheets (rating + individual) have identical columns

**Changes needed**:
- Update `ENGAGEMENT_RESULT_FIELDS` in evaluate.gs
- Ensure `getResultHeaders()` returns the same fields for all sheets
- Update `ensureResultHeaders()` to write correct headers

### 3. Remove Unused Functions

**Analysis needed for each file**:
- ✓ evaluate.gs - Keep all (core evaluation logic)
- ✓ make_individual.gs - Keep all (core sheet management)
- ✓ send_response.gs - Keep all (main entry point)
- ✓ record_engagement.gs - Keep all (data recording)
- ✓ make_mail_contents.gs - Keep all (email generation)
- ✓ make_charts.gs - Review for unused chart functions
- ✓ ConvertHtml.gs - Review for unused conversion functions
- ✓ set_globals.gs - Keep all (global initialization)
- ⊗ maintenance.gs - SKIP (per user request)
- ⊗ tentative.gs - SKIP (per user request)
- ⊗ utilities.gs - SKIP (per user request)

## Additional Recommendations

### 1. Add E_mean_6 (Optional but Useful)

**Current**: E_mean_6 is calculated but not exported
**Recommendation**: Add it for completeness (useful for understanding baseline)

**Updated field order with E_mean_6** (24 → 25 fields):
```
level, trend_base, trend_recent, trend_refined, big_change, stability_6,
strength_short, weakness_short, strength_mid, weakness_mid,
E_delta_1, E_delta_1_prev, E_delta_1_std_12,
E_mean_6, E_std_6, E_std_12,   ← Include E_mean_6
V_delta_1, D_delta_1, A_delta_1,
E_momentum_3, E_slope_6, E_slope_6_std_12,
V_slope_6, D_slope_6, A_slope_6
```

### 2. Add Field Type Documentation

Create a constant to document field types (helpful for future maintenance):

```javascript
const FIELD_METADATA = {
  // Categorical fields
  level: { type: "string", description: "Engagement level category" },
  trend_base: { type: "string", description: "Mid-term trend" },
  // ... etc

  // Numeric fields
  E_delta_1: { type: "number", description: "1-month change in engagement" },
  // ... etc
};
```

### 3. Separate Concerns

**Current**: evaluate.gs has 778 lines mixing:
- Configuration constants
- Core analysis logic
- Utility functions
- Data transformation

**Recommendation**: Split into modules (future work):
- `evaluate_config.gs` - Constants and thresholds
- `evaluate_core.gs` - Main analysis function
- `evaluate_utils.gs` - Helper functions (theilSenSlope, mean, std, etc.)

### 4. Add Data Validation

Add validation to catch data quality issues early:

```javascript
function validateEngagementData(data) {
  // Check for required columns
  // Check for numeric values in range
  // Check for duplicate records
  // Return validation report
}
```

### 5. Improve Error Handling

Current code has minimal error handling. Add try-catch blocks and meaningful error messages:

```javascript
function analyzeEngagement(data) {
  try {
    // ... existing logic
  } catch (error) {
    Logger.log(`Error in analyzeEngagement: ${error.message}`);
    Logger.log(`Stack trace: ${error.stack}`);
    return createEmptyResults(); // Graceful degradation
  }
}
```

### 6. Add Performance Monitoring

For large datasets, add timing logs:

```javascript
function analyzeEngagement(data) {
  const startTime = new Date();
  // ... analysis logic
  const endTime = new Date();
  Logger.log(`Analysis took ${endTime - startTime}ms for ${data.length} records`);
}
```

## Concerns & Risks

### 1. Breaking Changes

**Risk**: Adding fields changes the column structure
**Mitigation**:
- Keep field additions at the end OR
- Use explicit column positions
- Update all references to column indices
- Test thoroughly before deployment

### 2. Data Migration

**Risk**: Existing sheets have old column structure
**Mitigation**:
- Create migration script to add new columns
- Backfill calculated values for existing records
- Keep backup before migration

### 3. Performance Impact

**Risk**: Adding more calculations could slow down form submission
**Mitigation**:
- Monitor execution time
- Most new fields (std, mean) are already calculated internally
- Minimal performance impact expected

### 4. Testing Burden

**Risk**: More fields = more testing needed
**Mitigation**:
- Use existing verify_and_repair_ratings.gs script
- Add automated tests for new fields
- Test with production data before rollout

## Implementation Priority

### Phase 1: Critical (Do First)
1. ✅ Add E_std_6, E_std_12, E_momentum_3 to ENGAGEMENT_RESULT_FIELDS
2. ✅ Update sheet headers
3. ✅ Test with verify script
4. ✅ Deploy to production

### Phase 2: Important (Do Soon)
1. Remove unused functions from ConvertHtml.gs and make_charts.gs
2. Add field type documentation
3. Create data migration script for existing records
4. Add validation functions

### Phase 3: Nice-to-Have (Do Later)
1. Split evaluate.gs into modules
2. Add comprehensive error handling
3. Add performance monitoring
4. Document all functions with JSDoc comments

## Testing Plan

### 1. Unit Tests
- Test that new fields are calculated correctly
- Test that field order matches specification
- Test with edge cases (minimal history, NaN values)

### 2. Integration Tests
- Test full flow: form submission → recording → analysis → email
- Verify log matches sheet values
- Verify individual sheets match rating sheet

### 3. Migration Tests
- Test backfill script on copy of production data
- Verify all existing records get new fields calculated
- Verify no data loss or corruption

## Questions for User

1. **E_momentum**: Do you want E_momentum_3 (current) or E_momentum_6 (new)?
   - Current code uses 3-month window
   - Matches Python implementation
   - Would require code change to use 6-month window

2. **E_mean_6**: Should we include this field too?
   - Already calculated
   - Useful for understanding baseline engagement
   - Would make 25 total fields instead of 24

3. **Field positioning**: Confirm the order:
   - E_std_6 and E_std_12 before V_delta_1? ✓
   - E_momentum_3 before E_slope_6? ✓

4. **Backfill**: Do you want to backfill new fields for existing records?
   - Option A: Only new submissions get new fields
   - Option B: Recalculate all existing records

5. **Unused functions**: Should we be aggressive or conservative?
   - Aggressive: Remove anything not called in last 6 months
   - Conservative: Only remove obvious dead code

## Next Steps

Once you confirm the above questions, I will:
1. Update ENGAGEMENT_RESULT_FIELDS with new fields
2. Create migration script for backfilling
3. Identify and remove unused functions
4. Create comprehensive testing script
5. Document all changes
