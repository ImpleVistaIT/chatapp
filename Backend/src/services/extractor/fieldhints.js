export const FIELD_HINTS = [
  {
    field: "PoNo",
    terms: [
      "po", "po no", "po number", "purchase order", "purchase order number",
      "purchase order id", "order number", "order id",
      "document number", "doc number", "doc no",
      "po reference", "order reference",
      "purchase document", "purchase doc number",
      "po code", "order code",
      "po identifier", "order identifier",
      "po record", "order record",
      "po entry", "purchase entry"
    ],
  },
  {
    field: "PoItem",
    terms: [
      "po item", "po item number", "item number", "item no",
      "line item", "line item number",
      "order item", "order item number",
      "item position", "position number",
      "item line", "line number",
      "po line", "po line item",
      "item reference", "item id",
      "line reference", "line id",
      "item sequence", "item entry",
      "line entry"
    ],
  },
  {
    field: "MatNo",
    terms: [
      "mat no", "matno", "material", "material number",
      "material code", "material id",
      "product", "product id", "product code", "product number",
      "item", "item id", "item code", "item number",
      "sku", "stock keeping unit",
      "part number", "part code",
      "article", "article number",
      "inventory item", "stock item",
      "catalog item", "reference item"
    ],
  },
  {
    field: "SuppAcoutNo",
    terms: [
      "supplier", "supplier id", "supplier code", "supplier number",
      "supplier name", "supplier account",
      "vendor", "vendor id", "vendor code", "vendor number",
      "vendor name", "vendor account",
      "seller", "seller id", "seller code",
      "service provider", "third party",
      "business partner", "bp",
      "supplier reference", "vendor reference",
      "supplier details", "vendor details",
      "supplier info", "vendor info"
    ],
  },
  {
    field: "CompanyCode",
    terms: [
      "company code", "company id", "company",
      "business unit code", "business unit",
      "legal entity", "entity code",
      "organization code", "org code",
      "company identifier", "company number",
      "corporate code", "firm code",
      "organization id", "entity id",
      "company reference", "business code",
      "company entry", "company record"
    ],
  },
  {
    field: "NetPrice",
    terms: [
      "price", "net price", "unit price", "price per unit",
      "item price", "cost", "amount",
      "net amount", "line price", "line value",
      "value", "price value",
      "basic price", "final price",
      "purchase price", "buying price",
      "procurement cost", "cost per item",
      "total price", "total amount",
      "item cost", "rate",
      "per unit cost", "price amount"
    ],
  },
  {
    field: "Menge",
    terms: [
      "qty", "quantity", "order quantity", "ordered quantity",
      "quantity ordered", "qty ordered",
      "number of items", "number of units",
      "total quantity", "quantity value",
      "units", "units ordered",
      "count", "item count",
      "number of pieces", "pieces", "pcs",
      "total units", "quantity total",
      "item quantity", "volume ordered",
      "how many items", "how many units"
    ],
  },
  {
    field: "ItemDeliDt",
    terms: [
      "del date", "delivery date", "delivery due date",
      "eta", "estimated time of arrival",
      "expected delivery", "expected delivery date",
      "expected arrival", "arrival date",
      "shipment date", "shipping date",
      "dispatch date",
      "delivery timeline", "delivery schedule",
      "delivery time",
      "expected shipment date",
      "arrival expected",
      "delivery planned date",
      "delivery commitment date",
      "when delivery", "delivery timing"
    ],
  },
  {
    field: "Wemng",
    terms: [
      "gr qty", "grn", "delivered qty",
      "delivered quantity", "quantity delivered",
      "goods receipt", "goods received",
      "goods receipt quantity",
      "received quantity", "received qty",
      "quantity received",
      "delivery quantity",
      "items received", "goods delivered",
      "stock received",
      "inbound quantity", "received stock",
      "fulfilled quantity",
      "delivery completed quantity",
      "received amount",
      "delivery done quantity",
      "received items"
    ],
  },
  {
    field: "CurKey",
    terms: [
      "ccy", "curr", "currency",
      "currency code", "currency type",
      "transaction currency",
      "payment currency",
      "billing currency",
      "invoice currency",
      "base currency",
      "local currency",
      "global currency",
      "currency used",
      "currency value type",
      "currency format",
      "money type",
      "transaction money",
      "currency value",
      "currency key",
      "currency identifier"
    ],
  },
  {
    field: "ExcngRate",
    terms: [
      "fx", "exchange rate", "exch rate",
      "currency exchange rate",
      "foreign exchange rate",
      "currency conversion rate",
      "conversion rate",
      "rate of exchange",
      "currency conversion",
      "conversion factor",
      "exchange value",
      "exchange multiplier",
      "currency multiplier",
      "fx rate",
      "conversion value",
      "currency rate",
      "exchange factor",
      "rate value",
      "conversion price",
      "exchange ratio"
    ],
  },
  {
    field: "ShortText",
    terms: [
      "desc", "description", "item description",
      "product description", "material description",
      "short text",
      "details", "item details", "product details",
      "information", "item information",
      "product information",
      "item name", "product name",
      "material name",
      "label", "title",
      "product title",
      "description text",
      "item label",
      "product label",
      "item info"
    ],
  },
  {
    field: "Plant",
    terms: [
      "plant", "plant id", "plant number",
      "factory", "factory code",
      "facility", "facility code",
      "manufacturing plant",
      "manufacturing location",
      "production plant", "production unit",
      "site", "site location",
      "plant location",
      "production site",
      "manufacturing site",
      "factory location",
      "plant code",
      "facility location",
      "production facility"
    ],
  },
  {
    field: "StrLoc",
    terms: [
      "sloc", "stor loc", "storage location",
      "storage area",
      "warehouse", "warehouse location",
      "warehouse storage",
      "inventory location",
      "stock location",
      "storage", "inventory storage",
      "store", "depot",
      "storage bin", "bin location",
      "rack", "shelf",
      "warehouse bin",
      "holding location",
      "stock point",
      "inventory point",
      "storage facility"
    ],
  },
];
export const FIELD_HINTS_PART2 = [
  {
    field: "Mandt",
    terms: [
      "client", "client id", "client number", "mandant",
      "sap client", "system client",
      "client code", "client key",
      "client identifier", "tenant",
      "tenant id", "tenant code",
      "client reference", "client entry",
      "client record", "sap tenant",
      "environment client", "system tenant",
      "client value", "client field"
    ],
  },
  {
    field: "DeliverySchedule",
    terms: [
      "delivery schedule", "schedule", "schedule line",
      "delivery line", "schedule number",
      "delivery sequence", "delivery schedule line",
      "shipment schedule", "delivery plan",
      "schedule id", "schedule code",
      "delivery timing line",
      "planned delivery schedule",
      "schedule reference",
      "schedule entry",
      "delivery schedule record",
      "shipment schedule line",
      "schedule position",
      "delivery plan line"
    ],
  },
  {
    field: "SequentialNo",
    terms: [
      "sequence", "sequence number", "sequential number",
      "sequence id", "line sequence",
      "sequence code", "sequence reference",
      "order sequence", "item sequence",
      "line sequence number",
      "sequence entry", "sequence record",
      "sequence position",
      "step number", "step id",
      "process sequence", "execution sequence",
      "sequence index", "sequence value"
    ],
  },
  {
    field: "PoDocType",
    terms: [
      "po type", "document type", "doc type",
      "purchase order type", "order type",
      "purchase type", "document category type",
      "po document type",
      "order classification",
      "purchase category",
      "doc classification",
      "document classification",
      "order document type",
      "po classification",
      "purchase doc type",
      "doc type code",
      "po type code",
      "order type code"
    ],
  },
  {
    field: "PoDocCatg",
    terms: [
      "document category", "doc category",
      "po category", "purchase category",
      "document type category",
      "doc classification category",
      "purchase doc category",
      "order category",
      "category type",
      "document grouping",
      "doc group",
      "purchase grouping",
      "category code",
      "doc category code",
      "po category code",
      "classification category"
    ],
  },
  {
    field: "Status",
    terms: [
      "status", "current status", "document status",
      "order status", "po status",
      "processing status", "system status",
      "record status", "entry status",
      "status code", "status value",
      "state", "current state",
      "condition", "stage",
      "workflow status",
      "approval status",
      "execution status",
      "lifecycle status"
    ],
  },
  {
    field: "UserCreated",
    terms: [
      "created by", "created user",
      "user created", "creator",
      "owner", "created person",
      "created name",
      "user id", "user name",
      "created account",
      "entered by", "recorded by",
      "entry user", "author",
      "system user", "operator",
      "user reference",
      "user code"
    ],
  },
  {
    field: "TermsPymntKey",
    terms: [
      "payment terms", "terms of payment",
      "payment condition", "payment key",
      "payment terms code",
      "payment agreement",
      "billing terms",
      "invoice terms",
      "payment schedule",
      "payment conditions",
      "payment configuration",
      "terms key",
      "payment rule",
      "payment setup",
      "payment policy"
    ],
  },
  {
    field: "DicountDays",
    terms: [
      "discount days", "payment discount days",
      "early payment days",
      "discount period",
      "cash discount days",
      "payment discount period",
      "discount timeline",
      "discount duration",
      "early payment period",
      "discount window",
      "payment benefit days",
      "discount validity days",
      "discount term days"
    ],
  },
  {
    field: "PoOrg",
    terms: [
      "purchase org", "purchasing organization",
      "procurement organization",
      "buying organization",
      "po organization",
      "purchase department",
      "procurement unit",
      "buying unit",
      "organization code",
      "org code",
      "purchase org code",
      "procurement code",
      "organization id",
      "org identifier"
    ],
  },
  {
    field: "PoGrp",
    terms: [
      "purchase group", "purchasing group",
      "buyer group", "procurement group",
      "buying team",
      "buyer team",
      "purchase team",
      "group code",
      "group id",
      "procurement team",
      "buyer id",
      "group identifier",
      "team code"
    ],
  },
  {
    field: "Incoterms1",
    terms: [
      "incoterms", "shipping terms",
      "delivery terms",
      "trade terms",
      "incoterms code",
      "shipping condition",
      "delivery condition",
      "trade condition",
      "logistics terms",
      "shipment terms",
      "incoterms part 1",
      "trade agreement terms"
    ],
  },
  {
    field: "Incoterms2",
    terms: [
      "incoterms location",
      "delivery location terms",
      "shipping location terms",
      "trade location",
      "incoterms place",
      "delivery point",
      "shipment location",
      "destination terms",
      "incoterms part 2",
      "delivery address terms"
    ],
  },
  {
    field: "NoForDocCond",
    terms: [
      "condition number",
      "Document condition number",
      "pricing condition number",
      "document condition number",
      "pricing reference",
      "condition reference",
      "pricing id",
      "pricing code",
      "condition id",
      "condition key",
      "pricing record number",
      "pricing entry"
    ],
  },
  {
    field: "IncoLoc",
    terms: [
      "incoterms location",
      "delivery location",
      "shipping location",
      "trade location",
      "shipment place",
      "delivery point",
      "destination location",
      "dispatch location",
      "logistics location",
      "shipping point"
    ],
  },
  {
    field: "RelGrp",
    terms: [
      "release group", "approval group",
      "authorization group",
      "approval team",
      "release team",
      "workflow group",
      "approval category",
      "release category",
      "group approval",
      "authorization team"
    ],
  },
  {
    field: "RelStrtgy",
    terms: [
      "release strategy",
      "approval strategy",
      "authorization strategy",
      "approval workflow",
      "release workflow",
      "approval process",
      "release process",
      "workflow strategy",
      "approval logic",
      "release mechanism"
    ],
  },
  {
    field: "RelInd",
    terms: [
      "release indicator",
      "approval indicator",
      "release flag",
      "approval flag",
      "release status flag",
      "approval marker",
      "release signal",
      "approval signal"
    ],
  },
  {
    field: "RelSt",
    terms: [
      "release status",
      "approval status",
      "release stage",
      "approval stage",
      "workflow status",
      "release condition",
      "approval condition",
      "status of release"
    ],
  },
];
export const FIELD_HINTS_PART3 = [
  {
    field: "UnitOfMeasure",
    terms: [
      "uom", "unit", "unit of measure",
      "measurement unit", "quantity unit",
      "unit type", "measurement type",
      "unit code", "uom code",
      "measurement code", "unit identifier",
      "unit reference", "unit value",
      "measurement unit code",
      "quantity measurement",
      "item unit", "product unit",
      "material unit", "stock unit"
    ],
  },
  {
    field: "OrderUnit",
    terms: [
      "order unit", "ordering unit",
      "purchase unit", "unit ordered",
      "order uom", "ordering measurement",
      "purchase measurement unit",
      "order measurement",
      "unit for order",
      "order unit type",
      "ordering unit code",
      "purchase unit code",
      "order quantity unit"
    ],
  },
  {
    field: "PriceUnit",
    terms: [
      "price unit", "unit for price",
      "pricing unit",
      "price per unit basis",
      "pricing measurement unit",
      "price quantity unit",
      "price calculation unit",
      "unit of pricing",
      "price denominator",
      "price base unit",
      "pricing factor unit"
    ],
  },
  {
    field: "Ntgew",
    terms: [
      "net weight", "weight net",
      "item net weight",
      "product net weight",
      "material net weight",
      "net mass", "net wt",
      "net weight value",
      "net weight quantity",
      "weight without packaging",
      "actual item weight"
    ],
  },
  {
    field: "Brgew",
    terms: [
      "gross weight", "total weight",
      "item gross weight",
      "product gross weight",
      "material gross weight",
      "gross mass", "gross wt",
      "gross weight value",
      "weight including packaging",
      "total item weight"
    ],
  },
  {
    field: "Volum",
    terms: [
      "volume", "item volume",
      "total volume",
      "product volume",
      "material volume",
      "volume measure",
      "volume value",
      "cubic volume",
      "space occupied",
      "volume size",
      "volume quantity"
    ],
  },
  {
    field: "VolUnit",
    terms: [
      "volume unit", "unit of volume",
      "volume measurement unit",
      "volume uom",
      "volume unit code",
      "volume measurement",
      "volume unit type"
    ],
  },
  {
    field: "MatType",
    terms: [
      "material type", "product type",
      "item type", "material category",
      "product category",
      "material classification",
      "item classification",
      "product classification",
      "material group type",
      "item category type"
    ],
  },
  {
    field: "PeriodInd",
    terms: [
      "period indicator",
      "time period indicator",
      "period type",
      "time indicator",
      "duration indicator",
      "period classification",
      "time classification",
      "period flag",
      "time period type"
    ],
  },
  {
    field: "IssueStrgLoc",
    terms: [
      "issue storage location",
      "issue location",
      "goods issue location",
      "stock issue location",
      "dispatch storage location",
      "issue warehouse",
      "issue sloc",
      "outgoing storage location",
      "issue stock location"
    ],
  },
  {
    field: "PrNo",
    terms: [
      "pr number", "purchase requisition",
      "purchase requisition number",
      "requisition number",
      "request number",
      "pr id", "requisition id",
      "purchase request number",
      "request reference"
    ],
  },
  {
    field: "PrItem",
    terms: [
      "pr item", "requisition item",
      "purchase requisition item",
      "request item",
      "pr line item",
      "requisition line",
      "request line",
      "pr item number"
    ],
  },
  {
    field: "DelivInd",
    terms: [
      "delivery indicator",
      "delivery flag",
      "delivery status flag",
      "delivery confirmation flag",
      "delivery boolean",
      "is delivered",
      "delivery check",
      "delivery marker"
    ],
  },
  {
    field: "OverDely",
    terms: [
      "over delivery", "over delivery tolerance",
      "extra delivery allowed",
      "over delivery limit",
      "excess delivery",
      "over supply",
      "over delivery percentage",
      "delivery tolerance limit"
    ],
  },
  {
    field: "GlActNo",
    terms: [
      "gl account", "general ledger account",
      "gl account number",
      "ledger account",
      "account number",
      "financial account",
      "account code",
      "gl code",
      "ledger code"
    ],
  },
  {
    field: "CostCenter",
    terms: [
      "cost center", "cost centre",
      "cost code",
      "expense center",
      "expense code",
      "cost unit",
      "department cost",
      "cost allocation unit",
      "cost center id"
    ],
  },
  {
    field: "CntrlArea",
    terms: [
      "controlling area",
      "control area",
      "management area",
      "finance control area",
      "cost control area",
      "control region",
      "controlling unit"
    ],
  },
  {
    field: "ProfitCenter",
    terms: [
      "profit center",
      "profit centre",
      "profit code",
      "revenue center",
      "revenue code",
      "profit unit",
      "income center",
      "profit division"
    ],
  },
  {
    field: "WbsElement",
    terms: [
      "wbs", "wbs element",
      "work breakdown structure",
      "project element",
      "project code",
      "project id",
      "wbs code",
      "project structure"
    ],
  },
  {
    field: "AccuntAsgCatg",
    terms: [
      "account assignment category",
      "account category",
      "assignment category",
      "account assignment type",
      "account classification",
      "account mapping category"
    ],
  },
  {
    field: "RecrdNo",
    terms: [
      "record number", "record id",
      "entry number",
      "entry id",
      "record reference",
      "record identifier",
      "entry reference"
    ],
  },
  {
    field: "RequesterName",
    terms: [
      "requester", "requested by",
      "requestor name",
      "person requested",
      "requested person",
      "request owner",
      "request creator",
      "request user"
    ],
  },
  {
    field: "InvcRcptIndictor",
    terms: [
      "invoice receipt indicator",
      "invoice received flag",
      "invoice indicator",
      "invoice received status",
      "invoice confirmation",
      "invoice flag",
      "invoice check"
    ],
  },
  {
    field: "GrInvcVerifictn",
    terms: [
      "gr invoice verification",
      "goods receipt invoice verification",
      "invoice verification",
      "gr verification",
      "invoice matching",
      "invoice validation",
      "gr invoice check"
    ],
  },
  {
    field: "RlseTotalValue",
    terms: [
      "release total value",
      "approved value",
      "release amount",
      "approved amount",
      "release cost",
      "approved total",
      "release price",
      "approved price"
    ],
  },
  {
    field: "GoodsRcptDys",
    terms: [
      "goods receipt days",
      "delivery days",
      "receiving days",
      "receipt duration",
      "delivery duration",
      "receiving period",
      "goods receipt period"
    ],
  },
  {
    field: "PlannedDel",
    terms: [
      "planned delivery",
      "planned delivery days",
      "delivery plan",
      "delivery planning",
      "planned shipment",
      "planned dispatch",
      "delivery schedule days"
    ],
  },
  {
    field: "CashDiscntPrcentg",
    terms: [
      "cash discount percentage",
      "discount percentage",
      "payment discount percent",
      "cash discount rate",
      "discount rate",
      "payment discount",
      "discount value"
    ],
  },
  {
    field: "Procedur",
    terms: [
      "procedure",
      "pricing procedure",
      "process type",
      "procedure type",
      "process configuration",
      "pricing configuration",
      "process method"
    ],
  },
  {
    field: "PurchasingDocPrSt",
    terms: [
      "purchasing document processing status",
      "processing status",
      "document processing status",
      "purchase processing status",
      "po processing state",
      "processing condition",
      "document workflow status"
    ],
  },
];