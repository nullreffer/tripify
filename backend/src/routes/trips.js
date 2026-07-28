diff --git a/backend/src/routes/trips.js b/backend/src/routes/trips.js
index 88817ac..88817ac 100644
--- a/backend/src/routes/trips.js
+++ b/backend/src/routes/trips.js
@@
 const express = require('express');
@@
 const router = express.Router();
+
+// mount auto-create route
+const autoCreate = require('./autoCreate');
+router.use(autoCreate);
