const { pool } = require("../config/db");

// Format date helper: returns YYYY-MM-DD string
function formatDateStr(d) {
  if (!d) return "";
  if (typeof d === "string") return d.split("T")[0];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${day}-${m}`; // will use standard iso string
}

// GET /api/reports/bookings — Comprehensive Booking & Revenue Report for Admin and Turf Owners
async function getBookingRevenueReport(req, res) {
  const user = req.user;
  const isAdmin = user.role === "admin";
  const isOwner = user.role === "owner";

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: "Access denied. Only Owners and Admins can view reports." });
  }

  try {
    const {
      startDate,
      endDate,
      singleDate,
      dateType = "slot_date", // 'slot_date' (match date) or 'booking_date' (created_at date)
      turfId,
      sport,
      status,
      search,
    } = req.query;

    const conditions = [];
    const params = [];

    // 1. Role-based Turf scoping
    if (!isAdmin) {
      params.push(user.id);
      conditions.push(`t.owner_id = $${params.length}`);
    }

    // 2. Specific Turf Filter
    if (turfId && turfId !== "all") {
      params.push(Number(turfId));
      conditions.push(`t.id = $${params.length}`);
    }

    // 3. Date filtering:
    // Support: Single Date, Date Range (startDate & endDate), or All Dates (irrespective of dates)
    const targetDateColumn = dateType === "booking_date" ? "b.created_at::date" : "s.date";

    if (singleDate && singleDate.trim() !== "") {
      params.push(singleDate.trim());
      conditions.push(`${targetDateColumn} = $${params.length}`);
    } else {
      if (startDate && startDate.trim() !== "") {
        params.push(startDate.trim());
        conditions.push(`${targetDateColumn} >= $${params.length}`);
      }
      if (endDate && endDate.trim() !== "") {
        params.push(endDate.trim());
        conditions.push(`${targetDateColumn} <= $${params.length}`);
      }
    }

    // 4. Sport Filter
    if (sport && sport !== "all") {
      params.push(sport.trim().toLowerCase());
      conditions.push(`LOWER(s.sport_type) = $${params.length}`);
    }

    // 5. Booking / Payment Status Filter
    if (status && status !== "all") {
      if (status === "confirmed") {
        conditions.push("b.status = 'confirmed'");
      } else if (status === "cancelled") {
        conditions.push("b.status = 'cancelled'");
      } else if (status === "completed") {
        conditions.push("p.status = 'completed'");
      } else if (status === "pending") {
        conditions.push("p.status = 'pending'");
      } else if (status === "refunded") {
        conditions.push("p.status = 'refunded'");
      }
    }

    // 6. Keyword Search (Customer Name, Email, Phone, Turf Name, Reference, Booking ID)
    if (search && search.trim() !== "") {
      const q = `%${search.trim().toLowerCase()}%`;
      const searchNum = Number(search.trim());
      params.push(q);
      const qIdx = params.length;

      if (!isNaN(searchNum) && Number.isInteger(searchNum)) {
        params.push(searchNum);
        const numIdx = params.length;
        conditions.push(`(
          LOWER(u.name) LIKE $${qIdx} OR
          LOWER(u.email) LIKE $${qIdx} OR
          LOWER(u.phone) LIKE $${qIdx} OR
          LOWER(t.name) LIKE $${qIdx} OR
          LOWER(COALESCE(p.transaction_ref, '')) LIKE $${qIdx} OR
          LOWER(COALESCE(p.refund_id, '')) LIKE $${qIdx} OR
          b.id = $${numIdx}
        )`);
      } else {
        conditions.push(`(
          LOWER(u.name) LIKE $${qIdx} OR
          LOWER(u.email) LIKE $${qIdx} OR
          LOWER(u.phone) LIKE $${qIdx} OR
          LOWER(t.name) LIKE $${qIdx} OR
          LOWER(COALESCE(p.transaction_ref, '')) LIKE $${qIdx} OR
          LOWER(COALESCE(p.refund_id, '')) LIKE $${qIdx}
        )`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        b.id AS booking_id,
        b.status AS booking_status,
        b.created_at AS booking_created_at,
        b.cancellation_reason,
        b.cancelled_at,
        s.id AS slot_id,
        s.date AS slot_date,
        s.start_time,
        s.end_time,
        s.sport_type,
        s.price AS slot_price,
        t.id AS turf_id,
        t.name AS turf_name,
        t.location AS turf_location,
        t.owner_id,
        u.id AS customer_id,
        u.name AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone,
        p.id AS payment_id,
        p.amount AS payment_amount,
        p.status AS payment_status,
        p.payment_method,
        p.transaction_ref,
        p.refund_id,
        p.refund_status,
        p.refund_amount,
        p.refund_reason,
        p.refunded_at
      FROM bookings b
      JOIN slots s ON b.slot_id = s.id
      JOIN turfs t ON s.turf_id = t.id
      JOIN users u ON b.user_id = u.id
      LEFT JOIN payments p ON b.payment_id = p.id
      ${whereClause}
      ORDER BY ${targetDateColumn} DESC, s.start_time DESC
    `;

    const result = await pool.query(query, params);
    const rawRows = result.rows;

    // Process and enrich individual bookings with standardized revenue metrics
    let totalBookings = rawRows.length;
    let confirmedBookings = 0;
    let cancelledBookings = 0;
    let totalGrossRevenue = 0;
    let totalRefunded = 0;
    let totalPendingRevenue = 0;
    let totalNetRevenue = 0;
    let onlineRevenue = 0;
    let cashRevenue = 0;
    const uniqueCustomersSet = new Set();
    const uniqueTurfsSet = new Set();

    // Map daily aggregation keyed by date
    const dailyMap = {};

    const enrichedBookings = rawRows.map((row) => {
      const slotPrice = Number(row.slot_price) || 0;
      const paymentAmount = row.payment_amount != null ? Number(row.payment_amount) : slotPrice;
      const refundAmt = Number(row.refund_amount) || 0;
      const payStatus = row.payment_status || (row.booking_status === "confirmed" ? "completed" : "unpaid");
      const payMethod = row.payment_method || (payStatus === "pending" ? "pay_at_venue" : "online");

      let bookingGrossRevenue = 0;
      let bookingNetRevenue = 0;
      let bookingRefunded = 0;
      let bookingPending = 0;

      if (payStatus === "completed") {
        bookingGrossRevenue = paymentAmount;
        bookingNetRevenue = paymentAmount;
      } else if (payStatus === "refunded") {
        bookingGrossRevenue = paymentAmount;
        bookingRefunded = refundAmt || paymentAmount;
        bookingNetRevenue = Math.max(0, paymentAmount - bookingRefunded);
      } else if (payStatus === "pending") {
        bookingPending = paymentAmount;
      } else if (row.booking_status === "confirmed" && !row.payment_id) {
        // Fallback for confirmed booking without explicit payment record
        bookingGrossRevenue = slotPrice;
        bookingNetRevenue = slotPrice;
      }

      // Overall aggregates
      if (row.booking_status === "confirmed") {
        confirmedBookings++;
      } else {
        cancelledBookings++;
      }

      totalGrossRevenue += bookingGrossRevenue;
      totalRefunded += bookingRefunded;
      totalNetRevenue += bookingNetRevenue;
      totalPendingRevenue += bookingPending;

      if (bookingGrossRevenue > 0) {
        if (payMethod === "pay_at_venue") {
          cashRevenue += bookingGrossRevenue;
        } else {
          onlineRevenue += bookingGrossRevenue;
        }
      }

      uniqueCustomersSet.add(row.customer_id);
      uniqueTurfsSet.add(row.turf_id);

      // Key date for daily history grouping
      const groupingDate = dateType === "booking_date"
        ? (row.booking_created_at ? new Date(row.booking_created_at).toISOString().split("T")[0] : row.slot_date)
        : (row.slot_date instanceof Date ? row.slot_date.toISOString().split("T")[0] : String(row.slot_date).split("T")[0]);

      if (!dailyMap[groupingDate]) {
        dailyMap[groupingDate] = {
          date: groupingDate,
          totalBookings: 0,
          confirmedBookings: 0,
          cancelledBookings: 0,
          grossRevenue: 0,
          refundedAmount: 0,
          netRevenue: 0,
          pendingRevenue: 0,
          onlineRevenue: 0,
          cashRevenue: 0,
        };
      }

      const day = dailyMap[groupingDate];
      day.totalBookings += 1;
      if (row.booking_status === "confirmed") day.confirmedBookings += 1;
      else day.cancelledBookings += 1;
      day.grossRevenue += bookingGrossRevenue;
      day.refundedAmount += bookingRefunded;
      day.netRevenue += bookingNetRevenue;
      day.pendingRevenue += bookingPending;
      if (bookingGrossRevenue > 0) {
        if (payMethod === "pay_at_venue") day.cashRevenue += bookingGrossRevenue;
        else day.onlineRevenue += bookingGrossRevenue;
      }

      return {
        booking_id: row.booking_id,
        booking_status: row.booking_status,
        booking_created_at: row.booking_created_at,
        cancellation_reason: row.cancellation_reason,
        cancelled_at: row.cancelled_at,
        slot_id: row.slot_id,
        slot_date: row.slot_date instanceof Date ? row.slot_date.toISOString().split("T")[0] : String(row.slot_date).split("T")[0],
        start_time: row.start_time,
        end_time: row.end_time,
        sport_type: row.sport_type,
        slot_price: slotPrice,
        turf_id: row.turf_id,
        turf_name: row.turf_name,
        turf_location: row.turf_location,
        owner_id: row.owner_id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        customer_phone: row.customer_phone,
        payment_id: row.payment_id,
        payment_status: payStatus,
        payment_method: payMethod,
        payment_amount: paymentAmount,
        gross_revenue: bookingGrossRevenue,
        refund_amount: bookingRefunded,
        net_revenue: bookingNetRevenue,
        pending_amount: bookingPending,
        transaction_ref: row.transaction_ref,
        refund_id: row.refund_id,
        refund_status: row.refund_status,
        refund_reason: row.refund_reason,
        refunded_at: row.refunded_at,
      };
    });

    // Convert dailyMap to sorted array (newest date first)
    const dailyHistory = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    // Fetch accessible turfs for the filter dropdown
    let availableTurfs = [];
    if (isAdmin) {
      const turfsRes = await pool.query("SELECT id, name, location FROM turfs ORDER BY name ASC");
      availableTurfs = turfsRes.rows;
    } else {
      const turfsRes = await pool.query("SELECT id, name, location FROM turfs WHERE owner_id = $1 ORDER BY name ASC", [user.id]);
      availableTurfs = turfsRes.rows;
    }

    // Fetch distinct sports for the sport filter dropdown
    const sportsRes = await pool.query(
      "SELECT DISTINCT LOWER(sport_type) AS sport FROM slots WHERE sport_type IS NOT NULL AND sport_type != '' ORDER BY sport ASC"
    );
    const availableSports = sportsRes.rows.map((r) => r.sport.charAt(0).toUpperCase() + r.sport.slice(1));

    return res.json({
      summary: {
        totalBookings,
        confirmedBookings,
        cancelledBookings,
        totalGrossRevenue,
        totalRefunded,
        totalNetRevenue,
        totalPendingRevenue,
        onlineRevenue,
        cashRevenue,
        avgBookingValue: confirmedBookings > 0 ? (totalGrossRevenue / confirmedBookings).toFixed(2) : "0.00",
        uniqueCustomers: uniqueCustomersSet.size,
        turfsCount: uniqueTurfsSet.size,
      },
      daily: dailyHistory,
      bookings: enrichedBookings,
      filterOptions: {
        turfs: availableTurfs,
        sports: availableSports,
      },
      criteria: {
        startDate: startDate || null,
        endDate: endDate || null,
        singleDate: singleDate || null,
        dateType,
        turfId: turfId || "all",
        sport: sport || "all",
        status: status || "all",
        search: search || "",
      },
    });
  } catch (err) {
    console.error("Booking revenue report error:", err);
    return res.status(500).json({ error: "Failed to generate booking revenue report" });
  }
}

module.exports = {
  getBookingRevenueReport,
};
