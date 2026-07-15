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
          "ChangeType",
          "Category",
          "Purpose",
          "Workflow",
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

      list_change_requests_by_created_by: {
        label: "List change requests by created by",
        action: "execute_api",
        requiredInputs: ["fromDate", "toDate"],
        entityHints: ["fromDate", "toDate", "processType", "triggerAll", "createdBy", "createdByMode"],
        executor: "solman.charm.listChangeRequestsByCreatedBy",
      },

      cr_status_distribution: {
        label: "CR status distribution",
        action: "execute_api",
        requiredInputs: [],
        entityHints: [
          "processType",
          "fromDate",
          "toDate",
          "businessScope",
          "createdBy",
          "createdByMode",
          "status",
          "statusMode",
          "excludeStatuses",
          "triggerAll",
          "dateText",
        ],
        executor: "solman.charm.crStatusDistribution",
      },

      dependency_check: {
        label: "Dependency check",
        action: "execute_api",
        requiredInputs: ["objectId"],
        entityHints: ["objectId", "processType", "dependencyType"],
        executor: "solman.dependency.check",
      },
    },

    transport: {
      create_transport_request: {
        label: "Create transport request",
        action: "open_form",
        requiredInputs: ["SolmanChangeReq", "TrOwner", "Client", "WorkbenchReq", "CustomizingReq", "DeveloperSet"],
        entityHints: ["SolmanChangeReq", "TrOwner", "Client", "WorkbenchReq", "CustomizingReq", "DeveloperSet", "Developer", "Developers", "CR", "Change Request"],
        formId: "solman_create_transport_request",
        executor: "solman.transport.createTransportRequest",
      },

      create_transport_task: {
        label: "Create transport task",
        action: "open_form",
        requiredInputs: ["transportNo", "changeRequest", "developers"],
        entityHints: ["transportNo", "changeRequest", "developers"],
        formId: "solman_create_transport_task",
        executor: "solman.transport.createTransportTask",
      },

      release_transport_task: {
        label: "Release transport task",
        action: "open_form",
        requiredInputs: ["taskId"],
        entityHints: ["taskId"],
        formId: "solman_release_transport_task",
        executor: "solman.transport.releaseTransportTask",
      },

      create_transport: {
        label: "Create transport",
        action: "execute_api",
        requiredInputs: ["changeRequestId"],
        entityHints: ["changeRequestId", "description"],
        executor: "solman.transport.createTransport",
      },

      transport_list: {
        label: "List transports for CR",
        action: "execute_api",
        requiredInputs: ["changeRequestId"],
        entityHints: ["changeRequestId", "objectId", "processType"],
        executor: "solman.transport.listTransports",
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