import { poService } from "../services/po.service.js";
import { poTransformer } from "../transformers/po.transformer.js";
import { poIntents } from "./intents/po.intents.js";

// import { prService } from "../services/pr.service.js";
// import { prTransformer } from "../transformers/pr.transformer.js";
// import { prIntents } from "./intents/pr.intents.js";

// import { vendorService } from "../services/vendor.service.js";
// import { vendorTransformer } from "../transformers/vendor.transformer.js";
// import { vendorIntents } from "./intents/vendor.intents.js";

export const entityRegistry = {
  PO: {
    service: poService,
    transformer: poTransformer,
    intents: poIntents, // ✅ SHOW_PO_PR_ONLY must be added inside poIntents
  },

  // PR: {
  //   service: prService,
  //   transformer: prTransformer,
  //   intents: prIntents,
  // },

  // VENDOR: {
  //   service: vendorService,
  //   transformer: vendorTransformer,
  //   intents: vendorIntents,
  // },
};