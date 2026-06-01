export const ROUTING_INTENT_REGISTRY = {
  s4hana: {
    mm: {
      list_purchase_orders: {
        label: "List purchase orders",
        action: "execute_api",
        requiredInputs: [],
        entityHints: ["dateFrom", "dateTo", "vendor", "createdBy", "plant"],
        executor: "s4hana.mm.listPurchaseOrders",
      },
      get_purchase_order_details: {
        label: "Get purchase order details",
        action: "execute_api",
        requiredInputs: ["purchaseOrderId"],
        entityHints: ["purchaseOrderId"],
        executor: "s4hana.mm.getPurchaseOrderDetails",
      },
      check_approvals: {
        label: "Check approvals",
        action: "execute_api",
        requiredInputs: [],
        entityHints: ["userId", "status"],
        executor: "s4hana.mm.checkApprovals",
      },
    },
  },

  solman: {
    charm: {
      create_change_request: {
        label: "Create change request",
        action: "open_form",
        requiredInputs: [
          "ShortDesc",
          "DeliveryResponsible",
          "Developer",
          "Tester",
          "WorkItemReference",
          "Landscape",
        ],
        entityHints: [
          "ShortDesc",
          "DeliveryResponsible",
          "Developer",
          "Tester",
          "WorkItemReference",
          "Landscape",
          "REQ_URL_NAV",
        ],
        formId: "solman_create_cr",
        executor: "solman.charm.createChangeRequest",
      },

      get_change_request_details: {
        label: "Get change request details",
        action: "execute_api",
        requiredInputs: ["objectId"],
        entityHints: ["objectId", "processType"],
        executor: "solman.charm.getChangeRequestDetails",
      },

      list_change_requests: {
        label: "List change requests",
        action: "execute_api",
        requiredInputs: ["fromDate", "toDate"],
        entityHints: ["fromDate", "toDate", "processType", "triggerAll"],
        executor: "solman.charm.listChangeRequests",
      },
    },

    transport: {
      create_transport: {
        label: "Create transport",
        action: "execute_api",
        requiredInputs: ["changeRequestId"],
        entityHints: ["changeRequestId", "description"],
        executor: "solman.transport.createTransport",
      },
    },
  },
};

export function getIntentDefinition({ system, module, intent }) {
  return ROUTING_INTENT_REGISTRY?.[system]?.[module]?.[intent] || null;
}

export function isSupportedIntent({ system, module, intent }) {
  return Boolean(getIntentDefinition({ system, module, intent }));
}