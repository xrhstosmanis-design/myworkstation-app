# BackOffice invoice page-aware creation

After #3788 deployed, the existing LAB draft still showed one photo. Its description matched the legacy create hotfix, which clones the create button and submits only the primary job. That draft had no linked secondary job for the loader to recover.

The legacy hotfix now leaves the page-aware form and its original create handler intact. The native handler saves edited lines and sends additionalPageJobIds. Local dispatch verification passed. Hosted acceptance requires a new synthetic draft to verify both files are linked at creation and displayed after reopening. No real invoice changes.
