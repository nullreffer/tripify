*** Begin Patch
*** Update File: frontend/src/pages/TripWorkspace.jsx
@@
   return (
     <div className={`workspace ${darkMode ? 'dark' : ''}`}>
@@
-      {showModal && <SomeModal ... />}
+      {showDraftModal && (
+        <TripVerificationModal open={showDraftModal} draft={draftTrip} onClose={() => setShowDraftModal(false)} onConfirm={(parsed) => {
+          // Minimal confirm flow: create trip with parsed title via existing endpoint
+          (async () => {
+            try {
+              const res = await fetch('/api/trips', {
+                method: 'POST',
+                headers: { 'Content-Type': 'application/json' },
+                body: JSON.stringify({ title: parsed.title || 'Untitled Trip' })
+              });
+              if (res.ok) {
+                setShowDraftModal(false);
+                // reload trips or navigate
+                window.location.reload();
+              } else {
+                const j = await res.json();
+                alert(j.error || 'Failed to save trip');
+              }
+            } catch (e) { console.error(e); alert('Failed to save trip'); }
+          })();
+        }} />
+      )}
*** End Patch
