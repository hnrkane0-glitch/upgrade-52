require('./_fbauth');
// QuickCart subscription plans — the single source of truth for what a subscriber is charged.
// payment.html reads these through GET /api/paystack?action=plans, and the server only
// accepts a payment whose amount matches the plan stored on the user's account.
module.exports = {
  PLANS: {
    starter:    { name: 'Starter',    monthly: 7900,   annual: 75840 },
    pro:        { name: 'Pro',        monthly: 16590,  annual: 159264 },
    enterprise: { name: 'Enterprise', monthly: 45000,  annual: 432000 },
  },
  TRIAL_DAYS: 14,
  CARD_CHECK_KOBO: 5000,   // ₦50 card verification charge, refunded straight away
  PAID_DAYS: 30,
  // Cloud Backup add-on (paid monthly, on top of the plan). Change the price here.
  BACKUP_ADDON: { name: 'Cloud Backup', monthly: 2500 },
};
