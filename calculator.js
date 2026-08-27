(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HKMortgage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const POLICY = Object.freeze({
    maxLtv: 0.9,
    tier1SalaryMonths: 120,
    tier1RateOffset: 4.75,
    tier1FirstBand: 10_000_000,
    tier1Maximum: 20_000_000,
    tier1FloorFirstBand: 0.8,
    tier1FloorSecondBand: 1.0,
    tier2RateOffset: 2.5,
    tier2ToTier1Ratio: 1,
    dsrLimit: 0.5,
    governmentRentRate: 0.03,
    ratesBands: [
      { ceiling: 550_000, rate: 0.05 },
      { ceiling: 800_000, rate: 0.08 },
      { ceiling: Infinity, rate: 0.12 },
    ],
  });

  const safeNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function monthlyPayment(principal, annualRatePercent, years) {
    principal = Math.max(0, safeNumber(principal));
    years = Math.max(1, safeNumber(years, 30));
    const months = Math.round(years * 12);
    const monthlyRate = Math.max(0, safeNumber(annualRatePercent)) / 100 / 12;
    if (!principal) return 0;
    if (!monthlyRate) return principal / months;
    const factor = Math.pow(1 + monthlyRate, months);
    return (principal * monthlyRate * factor) / (factor - 1);
  }

  function stampDuty(propertyValue) {
    const value = Math.max(0, safeNumber(propertyValue));
    if (value <= 4_000_000) return value > 0 ? 100 : 0;
    if (value <= 4_323_780) return 100 + (value - 4_000_000) * 0.2;
    if (value <= 4_500_000) return value * 0.015;
    if (value <= 4_935_480) return 67_500 + (value - 4_500_000) * 0.1;
    if (value <= 6_000_000) return value * 0.0225;
    if (value <= 6_642_860) return 135_000 + (value - 6_000_000) * 0.1;
    if (value <= 9_000_000) return value * 0.03;
    if (value <= 10_080_000) return 270_000 + (value - 9_000_000) * 0.1;
    if (value <= 20_000_000) return value * 0.0375;
    if (value <= 21_739_120) return 750_000 + (value - 20_000_000) * 0.1;
    if (value <= 100_000_000) return value * 0.0425;
    if (value <= 109_574_470) return 4_250_000 + (value - 100_000_000) * 0.3;
    return value * 0.065;
  }

  function annualRates(rateableValue) {
    let remaining = Math.max(0, safeNumber(rateableValue));
    let previousCeiling = 0;
    let charge = 0;

    for (const band of POLICY.ratesBands) {
      const width = band.ceiling - previousCeiling;
      const amount = Math.min(remaining, width);
      charge += amount * band.rate;
      remaining -= amount;
      previousCeiling = band.ceiling;
      if (remaining <= 0) break;
    }
    return charge;
  }

  function tierRates(primeRate) {
    const prime = Math.max(0, safeNumber(primeRate));
    return {
      tier1First: Math.max(prime - POLICY.tier1RateOffset, POLICY.tier1FloorFirstBand),
      tier1Second: Math.max(prime - POLICY.tier1RateOffset, POLICY.tier1FloorSecondBand),
      tier2Rate: Math.max(prime - POLICY.tier2RateOffset, 0),
    };
  }

  function splitLoan(totalLoan, salary) {
    const loan = Math.max(0, safeNumber(totalLoan));
    const tier1SalaryCap = Math.max(0, safeNumber(salary)) * POLICY.tier1SalaryMonths;
    const tier1Cap = Math.min(tier1SalaryCap, POLICY.tier1Maximum);
    const tier1 = Math.min(loan, tier1Cap);
    const tier2 = Math.max(0, loan - tier1);
    const programCap = tier1Cap * (1 + POLICY.tier2ToTier1Ratio);
    return {
      tier1,
      tier2,
      tier1Cap,
      tier1SalaryCap,
      tier2Cap: tier1 * POLICY.tier2ToTier1Ratio,
      programCap,
      exceedsTier2Cap: tier2 > tier1 * POLICY.tier2ToTier1Ratio + 0.01,
    };
  }

  function paymentForLoan(totalLoan, salary, years, primeRate) {
    const split = splitLoan(totalLoan, salary);
    const rates = tierRates(primeRate);
    const tier1FirstAmount = Math.min(split.tier1, POLICY.tier1FirstBand);
    const tier1SecondAmount = Math.max(0, split.tier1 - POLICY.tier1FirstBand);
    const tier1FirstPayment = monthlyPayment(tier1FirstAmount, rates.tier1First, years);
    const tier1SecondPayment = monthlyPayment(tier1SecondAmount, rates.tier1Second, years);
    const tier2Payment = monthlyPayment(split.tier2, rates.tier2Rate, years);
    return {
      ...split,
      ...rates,
      tier1FirstAmount,
      tier1SecondAmount,
      tier1Payment: tier1FirstPayment + tier1SecondPayment,
      tier2Payment,
      totalPayment: tier1FirstPayment + tier1SecondPayment + tier2Payment,
    };
  }

  function maxLoanByDsr(salary, otherDebt, years, primeRate) {
    const income = Math.max(0, safeNumber(salary));
    const debt = Math.max(0, safeNumber(otherDebt));
    const allowance = income * POLICY.dsrLimit - debt;
    const upper = Math.min(income * POLICY.tier1SalaryMonths, POLICY.tier1Maximum) * 2;
    if (allowance <= 0 || upper <= 0) return 0;

    let low = 0;
    let high = upper;
    for (let i = 0; i < 70; i += 1) {
      const midpoint = (low + high) / 2;
      const payment = paymentForLoan(midpoint, income, years, primeRate).totalPayment;
      if (payment <= allowance) low = midpoint;
      else high = midpoint;
    }
    return low;
  }

  function derive(input) {
    const price = Math.max(0, safeNumber(input.price));
    const valuation = Math.max(0, safeNumber(input.valuation, price));
    const salary = Math.max(0, safeNumber(input.salary));
    const ltv = clamp(safeNumber(input.ltvPercent, 90) / 100, 0, POLICY.maxLtv);
    const years = clamp(safeNumber(input.years, 30), 1, 40);
    const primeRate = Math.max(0, safeNumber(input.primeRate, 5.25));
    const otherDebt = Math.max(0, safeNumber(input.otherDebt));
    const area = Math.max(0, safeNumber(input.area));
    const autoDsr = input.autoDsr !== false;
    const desiredTier2 = Math.max(0, safeNumber(input.desiredTier2, 1_000_000));

    const loanBase = Math.min(price, valuation);
    const propertyLoanCap = loanBase * ltv;
    const dsrLoanCap = maxLoanByDsr(salary, otherDebt, years, primeRate);
    const programTier1Cap = Math.min(salary * POLICY.tier1SalaryMonths, POLICY.tier1Maximum);
    const programLoanCap = programTier1Cap * (1 + POLICY.tier2ToTier1Ratio);
    const preferredTier1 = Math.min(programTier1Cap, propertyLoanCap);
    const tier2DsrCap = preferredTier1 + 0.01 >= programTier1Cap
      ? Math.max(0, dsrLoanCap - preferredTier1)
      : 0;
    const tier2PropertyCap = Math.max(0, propertyLoanCap - preferredTier1);
    const tier2PlanCap = preferredTier1 * POLICY.tier2ToTier1Ratio;
    const tier2AvailableCap = Math.min(tier2DsrCap, tier2PropertyCap, tier2PlanCap);
    const actualTier2 = autoDsr ? Math.min(desiredTier2, tier2AvailableCap) : desiredTier2;
    const requestedLoan = preferredTier1 + actualTier2;
    const loan = paymentForLoan(requestedLoan, salary, years, primeRate);
    const downPayment = Math.max(0, price - requestedLoan);
    const dsr = salary ? (loan.totalPayment + otherDebt) / salary : Infinity;
    const stress = paymentForLoan(requestedLoan, salary, years, primeRate + 2);
    const stressDsr = salary ? (stress.totalPayment + otherDebt) / salary : Infinity;
    const affordablePriceAtLtv = ltv ? dsrLoanCap / ltv : 0;
    const maxTier2ByDsr = Math.min(programTier1Cap, Math.max(0, dsrLoanCap - programTier1Cap));
    const tier1OnlyPayment = paymentForLoan(programTier1Cap, salary, years, primeRate).totalPayment;
    const fullTier2Payment = monthlyPayment(programTier1Cap, loan.tier2Rate, years);
    const incomeForBothTiersFull = (tier1OnlyPayment + fullTier2Payment + otherDebt) / POLICY.dsrLimit;
    const propertyValueForTier1Full = ltv ? programTier1Cap / ltv : 0;
    const constrainedByDsr = autoDsr && desiredTier2 > tier2DsrCap + 0.01;
    const constrainedByProperty = autoDsr && desiredTier2 > tier2PropertyCap + 0.01;
    const constrainedByPlan = autoDsr && desiredTier2 > tier2PlanCap + 0.01;

    const rateableValue = price * Math.max(0, safeNumber(input.rateableValuePercent, 3)) / 100;
    const ratesAnnual = annualRates(rateableValue);
    const governmentRentAnnual = input.hasGovernmentRent
      ? rateableValue * POLICY.governmentRentRate
      : 0;
    const managementMonthly = area * Math.max(0, safeNumber(input.managementRate, 3.5));
    const maintenanceMonthly = Math.max(0, safeNumber(input.maintenanceMonthly, 1_500));
    const monthlyNonMortgage = ratesAnnual / 12 + governmentRentAnnual / 12 + managementMonthly + maintenanceMonthly;
    const monthlyHolding = loan.totalPayment + monthlyNonMortgage;
    const housingRatio = salary ? monthlyHolding / salary : Infinity;

    const stampBase = Math.max(price, valuation);
    const duty = stampDuty(stampBase);
    const agencyFee = price * Math.max(0, safeNumber(input.agencyRate, 1)) / 100;
    const legalFee = Math.max(0, safeNumber(input.legalFee, 12_000));
    const renovation = area * Math.max(0, safeNumber(input.renovationRate, 1_000));
    const mortgageInsurance = requestedLoan * Math.max(0, safeNumber(input.mortgageInsuranceRate)) / 100;
    const miscFee = Math.max(0, safeNumber(input.miscFee, 10_000));
    const upfront = downPayment + duty + agencyFee + legalFee + renovation + mortgageInsurance + miscFee;

    const eligibleLtv = valuation > 0 && price > 0 && ltv <= POLICY.maxLtv
      && requestedLoan <= propertyLoanCap + 0.01;
    const eligibleDsr = dsr <= POLICY.dsrLimit + 1e-9;
    const eligiblePlan = !loan.exceedsTier2Cap && requestedLoan <= loan.programCap + 0.01;
    const eligible = eligibleLtv && eligibleDsr && eligiblePlan;
    const months = years * 12;
    const totalMortgagePaid = loan.totalPayment * months;
    const totalInterest = Math.max(0, totalMortgagePaid - requestedLoan);

    return {
      policy: POLICY,
      input: { ...input, price, valuation, salary, ltv, years, primeRate, otherDebt, area, desiredTier2 },
      loanBase,
      propertyLoanCap,
      programLoanCap,
      requestedLoan,
      downPayment,
      loan,
      dsr,
      stress,
      stressDsr,
      dsrLoanCap,
      affordablePriceAtLtv,
      maxTier2ByDsr,
      tier2DsrCap,
      tier2PropertyCap,
      tier2PlanCap,
      tier2AvailableCap,
      desiredTier2,
      actualTier2,
      incomeForBothTiersFull,
      propertyValueForTier1Full,
      constrainedByDsr,
      constrainedByProperty,
      constrainedByPlan,
      autoDsr,
      rateableValue,
      ratesAnnual,
      governmentRentAnnual,
      managementMonthly,
      maintenanceMonthly,
      monthlyNonMortgage,
      monthlyHolding,
      housingRatio,
      disposableAfterHousing: salary - monthlyHolding - otherDebt,
      stampBase,
      duty,
      agencyFee,
      legalFee,
      renovation,
      mortgageInsurance,
      miscFee,
      upfront,
      totalMortgagePaid,
      totalInterest,
      eligible,
      eligibleLtv,
      eligibleDsr,
      eligiblePlan,
    };
  }

  return {
    POLICY,
    monthlyPayment,
    stampDuty,
    annualRates,
    tierRates,
    splitLoan,
    paymentForLoan,
    maxLoanByDsr,
    derive,
  };
});
