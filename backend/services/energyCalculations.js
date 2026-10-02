// ==================================================
// URJA MITRA - ENERGY CALCULATION ENGINE
// ==================================================
// Centralized calculation logic for energy accounting.
// Keeps all dashboard calculations consistent and
// traceable to the underlying interval readings.
// ==================================================

const DEFAULT_EMISSION_FACTOR = 0.82;
const BALANCE_TOLERANCE_KWH = 0.01;


// ==================================================
// BASIC NUMBER HELPERS
// ==================================================

function toNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : 0;
}


function nonNegative(value) {
    return Math.max(0, toNumber(value));
}


function round(value, decimals = 2) {
    return Number(
        toNumber(value).toFixed(decimals)
    );
}


// ==================================================
// INTERVAL-LEVEL ENERGY ACCOUNTING
// ==================================================

function calculateIntervalMetrics(reading) {

    const renewableGeneration =
        nonNegative(
            reading.renewable_generation
        );

    const energyConsumption =
        nonNegative(
            reading.energy_consumption
        );

    const recordedGridImport =
        nonNegative(
            reading.grid_import
        );


    // Renewable energy directly supplying consumption.
    //
    // Grid import is treated as the recorded external
    // supply, while renewable contribution is the
    // remaining consumption up to the generated amount.

    const renewableUsed =
        Math.min(
            renewableGeneration,
            Math.max(
                0,
                energyConsumption -
                recordedGridImport
            )
        );


    // Renewable generation that was not consumed
    // during the same interval.

    const renewableSurplus =
        Math.max(
            0,
            renewableGeneration -
            renewableUsed
        );


    // Expected grid requirement if the system has no
    // battery/storage contribution and no export model.

    const calculatedGridImport =
        Math.max(
            0,
            energyConsumption -
            renewableUsed
        );


    // Energy-accounting identity:
    //
    // Renewable generation + grid import
    // =
    // Energy consumption + renewable surplus

    const balanceDifference =
        (
            renewableGeneration +
            recordedGridImport
        ) -
        (
            energyConsumption +
            renewableSurplus
        );


    const isBalanced =
        Math.abs(balanceDifference) <=
        BALANCE_TOLERANCE_KWH;


    // Percentage of generated renewable energy
    // that was actually consumed.

    const renewableUtilization =
        renewableGeneration > 0
            ? (
                renewableUsed /
                renewableGeneration
            ) * 100
            : 0;


    // Percentage of total consumption supplied
    // by renewable energy.

    const renewableShare =
        energyConsumption > 0
            ? (
                renewableUsed /
                energyConsumption
            ) * 100
            : 0;


    // Percentage of total consumption supplied
    // by the electrical grid.

    const gridDependency =
        energyConsumption > 0
            ? (
                recordedGridImport /
                energyConsumption
            ) * 100
            : 0;


    return {

        renewableGeneration:
            round(
                renewableGeneration
            ),

        energyConsumption:
            round(
                energyConsumption
            ),

        gridImport:
            round(
                recordedGridImport
            ),

        calculatedGridImport:
            round(
                calculatedGridImport
            ),

        renewableUsed:
            round(
                renewableUsed
            ),

        renewableSurplus:
            round(
                renewableSurplus
            ),

        renewableUtilization:
            round(
                renewableUtilization
            ),

        renewableShare:
            round(
                renewableShare
            ),

        gridDependency:
            round(
                gridDependency
            ),

        balanceDifference:
            round(
                balanceDifference,
                4
            ),

        isBalanced
    };
}


// ==================================================
// DATASET-LEVEL ENERGY ACCOUNTING
// ==================================================

function calculateEnergySummary(readings) {

    const rows =
        Array.isArray(readings)
            ? readings
            : [];


    // Calculate every reading independently first.
    //
    // This is important because it prevents a
    // mathematically incorrect total from hiding
    // an incorrect individual reading.

    const intervalMetrics =
        rows.map(
            (reading) => ({

                ...reading,

                energyMetrics:
                    calculateIntervalMetrics(
                        reading
                    )
            })
        );


    // ------------------------------------------
    // TOTAL ENERGY VALUES
    // ------------------------------------------

    const totals =
        intervalMetrics.reduce(
            (result, row) => {

                const metrics =
                    row.energyMetrics;


                result.totalRenewableGeneration +=
                    metrics.renewableGeneration;


                result.totalEnergyConsumption +=
                    metrics.energyConsumption;


                result.totalGridImport +=
                    metrics.gridImport;


                result.totalCalculatedGridImport +=
                    metrics.calculatedGridImport;


                result.totalRenewableUsed +=
                    metrics.renewableUsed;


                result.totalRenewableSurplus +=
                    metrics.renewableSurplus;


                result.totalBalanceDifference +=
                    metrics.balanceDifference;


                if (metrics.isBalanced) {

                    result.balancedReadings += 1;

                } else {

                    result.unbalancedReadings += 1;

                }


                return result;

            },

            {

                totalRenewableGeneration: 0,

                totalEnergyConsumption: 0,

                totalGridImport: 0,

                totalCalculatedGridImport: 0,

                totalRenewableUsed: 0,

                totalRenewableSurplus: 0,

                totalBalanceDifference: 0,

                balancedReadings: 0,

                unbalancedReadings: 0
            }
        );


    // ------------------------------------------
    // DATASET-LEVEL PERCENTAGES
    // ------------------------------------------

    const renewableUtilization =
        totals.totalRenewableGeneration > 0

            ? (
                totals.totalRenewableUsed /
                totals.totalRenewableGeneration
            ) * 100

            : 0;


    const renewableShare =
        totals.totalEnergyConsumption > 0

            ? (
                totals.totalRenewableUsed /
                totals.totalEnergyConsumption
            ) * 100

            : 0;


    const gridDependency =
        totals.totalEnergyConsumption > 0

            ? (
                totals.totalGridImport /
                totals.totalEnergyConsumption
            ) * 100

            : 0;


    // ------------------------------------------
    // DATA QUALITY
    // ------------------------------------------

    const dataQualityPercent =
        rows.length > 0

            ? (
                totals.balancedReadings /
                rows.length
            ) * 100

            : 100;


    // ------------------------------------------
    // CO2 CALCULATION
    // ------------------------------------------
    //
    // This uses the project's current configured
    // emission factor.
    //
    // The factor can be moved to configuration later
    // when we add the formal environmental-calculation
    // layer.

    const estimatedCO2AvoidedKg =
        totals.totalRenewableUsed *
        DEFAULT_EMISSION_FACTOR;


    return {

        ...totals,

        renewableUtilization,

        renewableShare,

        gridDependency,

        dataQualityPercent,

        estimatedCO2AvoidedKg,

        readings:
            rows.length,

        intervalMetrics
    };
}


// ==================================================
// EXPORTS
// ==================================================

module.exports = {

    DEFAULT_EMISSION_FACTOR,

    BALANCE_TOLERANCE_KWH,

    calculateIntervalMetrics,

    calculateEnergySummary,

    round
};