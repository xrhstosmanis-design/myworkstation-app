# Ριζάρειο — STATUS 101 with empty InputLine

Follow-up to #4249. The connector is ready after install but retained historical groups. Operator checks found 45 of the oldest 50 records have code 101 and blank normalized command. A sampled RES has three physical text lines then blank lines. Normalization classified all 45 as empty command. Fixture models the legacy InputLine prefix with empty value.

Accept empty parsed command for archival only with scoped server 101 proof, existing inactive-input guards, matching local scoped JSON and decoded RES and no nonblank trailing content. No change to live STATUS decisions, fiscal evidence or sale logic. Terminal acceptance remains pending.
