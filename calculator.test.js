const assert = require("node:assert/strict");
const calculator = require("./calculator.js");

const closeTo = (actual, expected, tolerance = 0.01) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
};

closeTo(calculator.monthlyPayment(120_000, 0, 10), 1_000);
closeTo(calculator.monthlyPayment(1_000_000, 12, 1), 88_848.79, 0.02);

assert.equal(calculator.stampDuty(0), 0);
assert.equal(calculator.stampDuty(4_000_000), 100);
assert.equal(calculator.stampDuty(4_100_000), 20_100);
closeTo(calculator.stampDuty(4_500_000), 67_500);
closeTo(calculator.stampDuty(5_000_000), 112_500);
closeTo(calculator.stampDuty(9_000_000), 270_000);
closeTo(calculator.stampDuty(20_000_000), 750_000);
closeTo(calculator.stampDuty(100_000_000), 4_250_000);

closeTo(calculator.annualRates(500_000), 25_000);
closeTo(calculator.annualRates(600_000), 31_500);
closeTo(calculator.annualRates(900_000), 59_500);

const split = calculator.splitLoan(4_500_000, 32_000);
assert.equal(split.tier1, 3_840_000);
assert.equal(split.tier2, 660_000);
assert.equal(split.programCap, 7_680_000);

const defaultResult = calculator.derive({
  price: 4_000_000,
  valuation: 4_000_000,
  salary: 32_000,
  ltvPercent: 90,
  years: 30,
  primeRate: 5.25,
  otherDebt: 0,
  area: 393,
  rateableValuePercent: 3,
  managementRate: 4.2,
  hasGovernmentRent: true,
  maintenanceMonthly: 0,
  agencyRate: 1,
  legalFee: 12_000,
  renovationRate: 1_500,
  mortgageInsuranceRate: 0,
  miscFee: 10_000,
});

assert.equal(defaultResult.requestedLoan, 3_600_000);
assert.equal(defaultResult.loan.tier1, 3_600_000);
assert.equal(defaultResult.loan.tier2, 0);
assert.equal(defaultResult.desiredTier2, 1_000_000);
assert.equal(defaultResult.tier2AvailableCap, 0);
assert.equal(defaultResult.loan.tier1First, 0.8);
assert.equal(defaultResult.loan.tier2Rate, 2.75);
closeTo(defaultResult.duty, 100);
closeTo(defaultResult.upfront, 1_051_600);
assert.equal(defaultResult.eligible, true);
assert.ok(defaultResult.dsr < 0.5);
assert.equal(defaultResult.constrainedByProperty, true);
closeTo(defaultResult.propertyValueForTier1Full, 4_266_666.67, 0.02);

const capPayment = calculator.paymentForLoan(defaultResult.dsrLoanCap, 32_000, 30, 5.25).totalPayment;
closeTo(capPayment, 16_000, 0.02);

const dsrCappedResult = calculator.derive({
  ...defaultResult.input,
  price: 6_000_000,
  valuation: 6_000_000,
  ltvPercent: 90,
  autoDsr: true,
});
closeTo(dsrCappedResult.requestedLoan, defaultResult.dsrLoanCap, 0.02);
assert.equal(dsrCappedResult.loan.tier1, 3_840_000);
closeTo(dsrCappedResult.loan.tier2, 979_480.87, 0.02);
closeTo(dsrCappedResult.dsr, 0.5, 0.000001);
assert.equal(dsrCappedResult.constrainedByDsr, true);
assert.equal(dsrCappedResult.eligible, true);
assert.ok(dsrCappedResult.incomeForBothTiersFull > 55_000);

const uncappedResult = calculator.derive({
  ...defaultResult.input,
  price: 6_000_000,
  valuation: 6_000_000,
  ltvPercent: 90,
  desiredTier2: 1_560_000,
  autoDsr: false,
});
assert.equal(uncappedResult.requestedLoan, 5_400_000);
assert.ok(uncappedResult.dsr > 0.5);
assert.equal(uncappedResult.eligible, false);

const targetedResult = calculator.derive({
  ...defaultResult.input,
  price: 6_000_000,
  valuation: 6_000_000,
  ltvPercent: 90,
  desiredTier2: 500_000,
  autoDsr: true,
});
assert.equal(targetedResult.loan.tier1, 3_840_000);
assert.equal(targetedResult.loan.tier2, 500_000);
assert.equal(targetedResult.requestedLoan, 4_340_000);
assert.equal(targetedResult.actualTier2, 500_000);
assert.ok(targetedResult.dsr < 0.5);
assert.equal(targetedResult.eligible, true);

console.log("calculator tests passed");
