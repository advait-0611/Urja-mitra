const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const pool = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

const URJA_BUILD_ID = "URJA-MITRA-FINAL-ALL-FIX-2026-10-01";
const URJA_BUILD_VERSION = "6.9.00";


/*
==================================================
URJA MITRA
SMART RENEWABLE ENERGY UTILIZATION & MANAGEMENT
SYSTEM

Backend:
Node.js + Express.js + MySQL

This file intentionally keeps the existing API
architecture and database structure intact.

Refinement pass:

1. Precise interval energy calculations
2. Appliance energy modelling in kWh
3. 15-minute optimizer resolution
4. Renewable surplus allocation
5. Priority-aware scheduling
6. Preferred operating windows
7. Renewable coverage calculation
8. Grid-energy estimation
9. Explainable recommendations
10. What-if optimization
11. Daily plan generation
12. Dynamic energy analysis
13. Data-quality diagnostics
14. Schedule conflict checking
15. Configurable emission factor
16. Stronger schedule validation
17. Existing schedule awareness
18. Safer API input validation
19. Consistent optimizer/daily-plan logic
==================================================
*/


// ==================================================
// SERVER CONFIGURATION
// ==================================================

app.use(cors());

app.use(
    express.json({
        limit: "100kb"
    })
);


// --------------------------------------------------
// FRONTEND STATIC SERVING
// --------------------------------------------------
// Serve frontend assets natively.
app.use(express.static(path.join(__dirname, "../frontend")));

// Serve Chart.js locally from node_modules.
app.use(
    "/vendor/chart.js",
    express.static(
        path.join(__dirname, "../node_modules/chart.js/dist")
    )
);


// ==================================================
// SYSTEM CONFIGURATION
// ==================================================

/*
    Configured Indian grid emission factor.

    This remains a configurable prototype factor
    and is returned through the API so that the
    frontend does not have to hard-code it.
*/

const GRID_EMISSION_FACTOR =
    0.727;

const GRID_EMISSION_FACTOR_UNIT =
    "kgCO2/kWh";

const GRID_EMISSION_FACTOR_SOURCE =
    "Central Electricity Authority (CEA) CO2 Baseline Database";

const GRID_EMISSION_FACTOR_PERIOD =
    "FY 2023-24";


// Energy calculations use a small tolerance
// because floating-point calculations can produce
// tiny numerical differences.
const ENERGY_BALANCE_TOLERANCE =
    0.01;


// Optimizer resolution.
//
// The database contains hourly energy readings,
// therefore the backend represents each hourly
// reading using 15-minute planning intervals.
//
// This gives better handling of 45, 90 and 120
// minute appliances without pretending the source
// data itself is more granular than the database.
const OPTIMIZER_SLOT_MINUTES =
    15;


// Candidate start-time resolution.
const OPTIMIZER_STEP_MINUTES =
    15;


// Maximum number of recommendation candidates
// retained internally for diagnostics.
const MAX_DIAGNOSTIC_CANDIDATES =
    2000;


// Maximum length accepted for a manually supplied
// schedule reason.
const MAX_REASON_LENGTH =
    500;


// Maximum additional load accepted by the
// what-if demonstration endpoint.
//
// This is intentionally generous for a prototype
// while preventing accidental absurd inputs.
const MAX_WHAT_IF_LOAD_KWH =
    1000;


// ==================================================
// BASIC HELPER FUNCTIONS
// ==================================================

function timeToMinutes(time) {

    const parts =
        String(time).split(":");


    return (
        Number(parts[0]) * 60 +
        Number(parts[1])
    );
}


function minutesToTime(minutes) {

    const normalized =
        Math.max(
            0,
            Math.min(
                1439,
                Math.round(minutes)
            )
        );


    const hours =
        Math.floor(
            normalized / 60
        );


    const mins =
        normalized % 60;


    return (
        String(hours).padStart(2, "0") +
        ":" +
        String(mins).padStart(2, "0") +
        ":00"
    );
}


function round(value, decimals = 2) {

    const number =
        Number(value);


    if (!Number.isFinite(number)) {
        return 0;
    }


    return Number(
        number.toFixed(decimals)
    );
}


function clamp(
    value,
    minimum,
    maximum
) {

    const number =
        Number(value);


    if (!Number.isFinite(number)) {
        return minimum;
    }


    return Math.min(
        maximum,
        Math.max(
            minimum,
            number
        )
    );
}


function getPriorityWeight(priority) {

    switch (priority) {

        case "High":
            return 1.00;

        case "Medium":
            return 0.85;

        case "Low":
            return 0.70;

        default:
            return 0.80;
    }
}


function isValidTime(time) {

    if (typeof time !== "string") {
        return false;
    }


    const match =
        time.match(
            /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/
        );


    return Boolean(match);
}


function normalizeDateOnly(value) {

    if (value === undefined || value === null) {
        return null;
    }

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return `${String(value.getUTCFullYear()).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
    }

    const normalized = String(value).trim();
    const lowered = normalized.toLowerCase();

    if (!normalized || lowered === "undefined" || lowered === "null" || lowered === "invalid date") {
        return null;
    }

    let match = normalized.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (match) return match[1];

    match = normalized.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (match) return match[1];

    match = normalized.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;

    match = normalized.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})(?:\s|$)/);
    if (match) {
        const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
        const month = months[match[1].toLowerCase()];
        if (month) return `${match[3]}-${String(month).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
    }

    return null;
}

function isValidDate(date) {

    const normalized =
        normalizeDateOnly(date);

    if (!normalized) {
        return false;
    }

    const parts =
        normalized.split("-").map(Number);

    const year = parts[0];
    const month = parts[1];
    const day = parts[2];

    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        year < 1900 ||
        year > 2100 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return false;
    }

    // Validate the actual calendar date without local timezone
    // conversion. This works consistently on Windows, Linux and
    // deployment servers regardless of their configured timezone.
    const parsed =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        );

    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}


function safeNumber(
    value,
    fallback = 0
) {

    const number =
        Number(value);


    return Number.isFinite(number)
        ? number
        : fallback;
}


/*
    Strict numeric validation.

    Unlike safeNumber(), this function is used
    when accepting API input and therefore does
    not silently convert invalid values into zero.
*/
function isFiniteNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return false;
    }


    const number =
        Number(value);


    return Number.isFinite(number);
}


function isNonNegativeNumber(value) {

    if (
        !isFiniteNumber(value)
    ) {

        return false;
    }


    return Number(value) >= 0;
}


function isBooleanLike(value) {

    return (
        value === true ||
        value === false ||
        value === 1 ||
        value === 0 ||
        value === "1" ||
        value === "0" ||
        value === "true" ||
        value === "false"
    );
}


function toBoolean(value) {

    return (
        value === true ||
        value === 1 ||
        value === "1" ||
        value === "true"
    );
}


function isValidPriority(priority) {

    return (
        priority === "High" ||
        priority === "Medium" ||
        priority === "Low"
    );
}


function isWithinWindow(
    startMinute,
    endMinute,
    windowStart,
    windowEnd
) {

    return (
        startMinute >= windowStart &&
        endMinute <= windowEnd
    );
}


// ==================================================
// ENERGY DATA VALIDATION
// ==================================================

/*
    Database values are validated before being used
    by the optimizer.

    Existing calculation functions still clamp
    negative values defensively, but this diagnostic
    function lets the APIs identify questionable
    source data rather than silently treating it as
    valid.
*/

function validateEnergyReading(
    reading
) {

    const problems = [];


  const parsedReadingDate =
    new Date(
        reading.reading_date
    );


if (
    Number.isNaN(
        parsedReadingDate.getTime()
    )
) {

    problems.push(
        "Invalid reading date"
    );
}  


    if (
        !isValidTime(
            String(
                reading.reading_time
            )
        )
    ) {

        problems.push(
            "Invalid reading time"
        );
    }


    if (
        !isNonNegativeNumber(
            reading.renewable_generation
        )
    ) {

        problems.push(
            "Invalid renewable generation"
        );
    }


    if (
        !isNonNegativeNumber(
            reading.energy_consumption
        )
    ) {

        problems.push(
            "Invalid energy consumption"
        );
    }


    if (
        !isNonNegativeNumber(
            reading.grid_import
        )
    ) {

        problems.push(
            "Invalid grid import"
        );
    }


    return {

        valid:
            problems.length === 0,

        problems
    };
}


function validateEnergyDataset(
    readings
) {

    const invalidReadings = [];


    readings.forEach(
        (
            reading,
            index
        ) => {

            const validation =
                validateEnergyReading(
                    reading
                );


            if (
                !validation.valid
            ) {

                invalidReadings.push({

                    index,

                    id:
                        reading.id,

                    readingDate:
                        reading.reading_date,

                    readingTime:
                        reading.reading_time,

                    problems:
                        validation.problems
                });
            }
        }
    );


    return {

        valid:
            invalidReadings.length === 0,

        totalReadings:
            readings.length,

        invalidReadings:

            invalidReadings,

        invalidCount:
            invalidReadings.length
    };
}


// ==================================================
// PRECISE ENERGY CALCULATION
// ==================================================

function calculateIntervalMetrics(
    reading
) {

    const renewableGeneration =
        Math.max(
            0,
            safeNumber(
                reading.renewable_generation
            )
        );


    const energyConsumption =
        Math.max(
            0,
            safeNumber(
                reading.energy_consumption
            )
        );


    const recordedGridImport =
        Math.max(
            0,
            safeNumber(
                reading.grid_import
            )
        );


    /*
        Renewable energy directly serving
        consumption.

        Formula:

        renewable used =
        min(
            renewable generation,
            consumption - grid import
        )
    */

    const renewableUsed =
        Math.min(
            renewableGeneration,
            Math.max(
                0,
                energyConsumption -
                recordedGridImport
            )
        );


    /*
        Renewable energy not required by the
        recorded baseline consumption.
    */

    const renewableSurplus =
        Math.max(
            0,
            renewableGeneration -
            renewableUsed
        );


    /*
        Grid energy calculated from the
        remaining consumption requirement.
    */

    const calculatedGridImport =
        Math.max(
            0,
            energyConsumption -
            renewableUsed
        );


    /*
        Balance equation:

        Renewable generation
        + Grid import
        =
        Consumption
        + Renewable surplus
    */

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
        Math.abs(
            balanceDifference
        ) <=
        ENERGY_BALANCE_TOLERANCE;


    const renewableUtilization =
        renewableGeneration > 0

            ? (
                renewableUsed /
                renewableGeneration
            ) * 100

            : 0;


    const renewableShare =
        energyConsumption > 0

            ? (
                renewableUsed /
                energyConsumption
            ) * 100

            : 0;


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

        recordedGridImport:
            round(
                recordedGridImport
            ),

        renewableUsed:
            round(
                renewableUsed
            ),

        renewableSurplus:
            round(
                renewableSurplus
            ),

        calculatedGridImport:
            round(
                calculatedGridImport
            ),

        balanceDifference:
            round(
                balanceDifference
            ),

        isBalanced,

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
            )
    };
}


// ==================================================
// ENERGY SUMMARY
// ==================================================

function calculateEnergySummary(
    readings
) {

    let totalRenewableGeneration = 0;
    let totalEnergyConsumption = 0;
    let totalGridImport = 0;
    let totalCalculatedGridImport = 0;
    let totalRenewableUsed = 0;
    let totalRenewableSurplus = 0;
    let totalBalanceDifference = 0;

    let balancedReadings = 0;
    let unbalancedReadings = 0;


    const intervalMetrics =
        readings.map(
            reading => {

                const metrics =
                    calculateIntervalMetrics(
                        reading
                    );


                totalRenewableGeneration +=
                    metrics.renewableGeneration;


                totalEnergyConsumption +=
                    metrics.energyConsumption;


                totalGridImport +=
                    metrics.recordedGridImport;


                totalCalculatedGridImport +=
                    metrics.calculatedGridImport;


                totalRenewableUsed +=
                    metrics.renewableUsed;


                totalRenewableSurplus +=
                    metrics.renewableSurplus;


                totalBalanceDifference +=
                    metrics.balanceDifference;


                if (
                    metrics.isBalanced
                ) {

                    balancedReadings++;

                } else {

                    unbalancedReadings++;
                }


                return {

                    ...reading,

                    energyMetrics:
                        metrics
                };
            }
        );


    const renewableUtilization =
        totalRenewableGeneration > 0

            ? (
                totalRenewableUsed /
                totalRenewableGeneration
            ) * 100

            : 0;


    const renewableShare =
        totalEnergyConsumption > 0

            ? (
                totalRenewableUsed /
                totalEnergyConsumption
            ) * 100

            : 0;


    const gridDependency =
        totalEnergyConsumption > 0

            ? (
                totalGridImport /
                totalEnergyConsumption
            ) * 100

            : 0;


    const estimatedCO2Avoided =
        totalRenewableUsed *
        GRID_EMISSION_FACTOR;


    const dataQualityPercent =
        readings.length > 0

            ? (
                balancedReadings /
                readings.length
            ) * 100

            : 0;


    return {

        totalRenewableGeneration:
            round(
                totalRenewableGeneration
            ),

        totalEnergyConsumption:
            round(
                totalEnergyConsumption
            ),

        totalGridImport:
            round(
                totalGridImport
            ),

        totalCalculatedGridImport:
            round(
                totalCalculatedGridImport
            ),

        totalRenewableUsed:
            round(
                totalRenewableUsed
            ),

        totalRenewableSurplus:
            round(
                totalRenewableSurplus
            ),

        totalBalanceDifference:
            round(
                totalBalanceDifference
            ),

        balancedReadings,

        unbalancedReadings,

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

        dataQualityPercent:
            round(
                dataQualityPercent
            ),

        estimatedCO2AvoidedKg:
            round(
                estimatedCO2Avoided
            ),

        readings:
            readings.length,

        intervalMetrics
    };
}


// ==================================================
// APPLIANCE ENERGY MODEL
// ==================================================

function calculateApplianceEnergy(
    appliance
) {

    const powerKW =
        Math.max(
            0,
            safeNumber(
                appliance.power_consumption
            )
        );


    const durationMinutes =
        Math.max(
            1,
            safeNumber(
                appliance.duration_minutes,
                1
            )
        );


    const durationHours =
        durationMinutes / 60;


    const energyKWh =
        powerKW *
        durationHours;


    return {

        powerKW:
            round(
                powerKW,
                3
            ),

        durationMinutes:
            durationMinutes,

        durationHours:
            round(
                durationHours,
                4
            ),

        energyKWh:
            round(
                energyKWh,
                4
            )
    };
}


// ==================================================
// APPLIANCE CONFIGURATION VALIDATION
// ==================================================

function validateApplianceConfiguration(
    appliance
) {

    const problems = [];


    if (
        !isFiniteNumber(
            appliance.power_consumption
        ) ||
        Number(
            appliance.power_consumption
        ) < 0
    ) {

        problems.push(
            "Invalid appliance power consumption"
        );
    }


    if (
        !isFiniteNumber(
            appliance.duration_minutes
        ) ||
        Number(
            appliance.duration_minutes
        ) <= 0
    ) {

        problems.push(
            "Invalid appliance duration"
        );
    }


    if (
        !isValidTime(
            String(
                appliance.preferred_start
            )
        )
    ) {

        problems.push(
            "Invalid preferred start time"
        );
    }


    if (
        !isValidTime(
            String(
                appliance.preferred_end
            )
        )
    ) {

        problems.push(
            "Invalid preferred end time"
        );
    }


    if (
        isValidTime(
            String(
                appliance.preferred_start
            )
        ) &&
        isValidTime(
            String(
                appliance.preferred_end
            )
        )
    ) {

        const preferredStart =
            timeToMinutes(
                appliance.preferred_start
            );


        const preferredEnd =
            timeToMinutes(
                appliance.preferred_end
            );


        const duration =
            Number(
                appliance.duration_minutes
            );


        if (
            preferredEnd <=
            preferredStart
        ) {

            problems.push(
                "Preferred operating window is invalid"
            );
        }


        if (
            duration >
            (
                preferredEnd -
                preferredStart
            )
        ) {

            problems.push(
                "Appliance duration exceeds preferred operating window"
            );
        }
    }


    if (
        appliance.priority !== undefined &&
        appliance.priority !== null &&
        !isValidPriority(
            appliance.priority
        )
    ) {

        problems.push(
            "Invalid appliance priority"
        );
    }


    return {

        valid:
            problems.length === 0,

        problems
    };
}


// ==================================================
// ENERGY SLOT BUILDER
// ==================================================

/*
    The database contains hourly readings.

    Each hourly reading is represented internally
    as 15-minute planning segments.

    Because the source dataset does not contain
    15-minute measurements, renewable generation,
    consumption and surplus are distributed uniformly
    across the source hour.

    This is explicitly an interpolation assumption,
    not a claim of real-time 15-minute measurement.
*/

function buildEnergySlots(
    energyRows
) {

    const slots = [];


    for (
        const reading
        of energyRows
    ) {

        const startMinute =
            timeToMinutes(
                reading.reading_time
            );


        const metrics =
            calculateIntervalMetrics(
                reading
            );


        const renewablePerHour =
            metrics.renewableGeneration;


        const consumptionPerHour =
            metrics.energyConsumption;


        const gridImportPerHour =
            metrics.recordedGridImport;


        const renewableUsedPerHour =
            metrics.renewableUsed;


        const renewableSurplusPerHour =
            metrics.renewableSurplus;


        /*
            One source hour becomes:

            60 / 15 = 4 planning slots.
        */

        const slotCount =
            60 /
            OPTIMIZER_SLOT_MINUTES;


        for (
            let index = 0;
            index < slotCount;
            index++
        ) {

            const slotStart =
                startMinute +
                (
                    index *
                    OPTIMIZER_SLOT_MINUTES
                );


            const fraction =
                OPTIMIZER_SLOT_MINUTES /
                60;


            slots.push({

                date:
                    reading.reading_date,

                startMinute:
                    slotStart,

                endMinute:
                    slotStart +
                    OPTIMIZER_SLOT_MINUTES,

                renewableGeneration:
                    renewablePerHour *
                    fraction,

                consumption:
                    consumptionPerHour *
                    fraction,

                gridImport:
                    gridImportPerHour *
                    fraction,

                renewableUsed:
                    renewableUsedPerHour *
                    fraction,

                renewableSurplus:
                    renewableSurplusPerHour *
                    fraction,

                /*
                    Renewable surplus already allocated
                    to previously scheduled flexible loads.
                */

                reservedRenewable:
                    0,

                /*
                    Additional load allocated to this
                    interval by the optimizer.
                */

                reservedLoad:
                    0
            });
        }
    }


    return slots;
}


// ==================================================
// SLOT CAPACITY CALCULATION
// ==================================================

function getAvailableRenewable(
    slot
) {

    return Math.max(
        0,
        slot.renewableSurplus -
        slot.reservedRenewable
    );
}


// ==================================================
// EXISTING SCHEDULE RESERVATION
// ==================================================

/*
    Existing database schedules are now considered
    by the optimizer.

    This prevents the optimizer from behaving as if
    a previously saved schedule does not exist.

    The function reserves the scheduled appliance's
    load in the matching 15-minute slots.

    Renewable allocation is calculated from the
    remaining renewable surplus rather than trusting
    an old stored estimate.
*/

function reserveExistingSchedule(
    schedule,
    appliance,
    energySlots
) {

    const scheduleStart =
        timeToMinutes(
            schedule.start_time
        );


    const scheduleEnd =
        timeToMinutes(
            schedule.end_time
        );


    const powerKW =
        Math.max(
            0,
            safeNumber(
                appliance.power_consumption
            )
        );


    for (
        const slot
        of energySlots
    ) {

        const overlapStart =
            Math.max(
                scheduleStart,
                slot.startMinute
            );


        const overlapEnd =
            Math.min(
                scheduleEnd,
                slot.endMinute
            );


        const overlapMinutes =
            Math.max(
                0,
                overlapEnd -
                overlapStart
            );


        if (
            overlapMinutes <= 0
        ) {

            continue;
        }


        const fraction =
            overlapMinutes /
            60;


        const loadEnergy =
            powerKW *
            fraction;


        const availableRenewable =
            Math.max(
                0,
                slot.renewableSurplus -
                slot.reservedRenewable
            );


        const renewableAllocated =
            Math.min(
                loadEnergy,
                availableRenewable
            );


        slot.reservedRenewable +=
            renewableAllocated;


        slot.reservedLoad +=
            loadEnergy;
    }
}


function reserveExistingSchedules(
    schedules,
    applianceMap,
    energySlots
) {

    const scheduledApplianceIds =
        new Set();


    for (
        const schedule
        of schedules
    ) {

        const appliance =
            applianceMap.get(
                Number(
                    schedule.appliance_id
                )
            );


        if (
            !appliance
        ) {

            continue;
        }


        scheduledApplianceIds.add(
            Number(
                schedule.appliance_id
            )
        );


        reserveExistingSchedule(
            schedule,
            appliance,
            energySlots
        );
    }


    return scheduledApplianceIds;
}


// ==================================================
// CANDIDATE EVALUATION
// ==================================================

function evaluateCandidate(
    appliance,
    candidateStart,
    candidateEnd,
    energySlots
) {

    const model =
        calculateApplianceEnergy(
            appliance
        );


    const powerKW =
        model.powerKW;


    const durationMinutes =
        model.durationMinutes;


    const requiredEnergy =
        model.energyKWh;


    let renewableGeneration =
        0;


    let renewableSurplus =
        0;


    let renewableEnergyAvailable =
        0;


    let renewableEnergyUsed =
        0;


    let gridEnergy =
        0;


    let reservedLoad =
        0;


    let coveredMinutes =
        0;


    let slotCount =
        0;


    for (
        const slot
        of energySlots
    ) {

        const overlapStart =
            Math.max(
                candidateStart,
                slot.startMinute
            );


        const overlapEnd =
            Math.min(
                candidateEnd,
                slot.endMinute
            );


        const overlapMinutes =
            Math.max(
                0,
                overlapEnd -
                overlapStart
            );


        if (
            overlapMinutes <= 0
        ) {

            continue;
        }


        const fraction =
            overlapMinutes /
            60;


        const candidateLoadEnergy =
            powerKW *
            fraction;


        const renewableGenerationInOverlap =
            slot.renewableGeneration *
            fraction;


        const renewableSurplusInOverlap =
            slot.renewableSurplus *
            fraction;


        const reservedRenewableInOverlap =
            slot.reservedRenewable *
            fraction;


        const availableRenewable =
            Math.max(
                0,
                renewableSurplusInOverlap -
                reservedRenewableInOverlap
            );


        const renewableForLoad =
            Math.min(
                candidateLoadEnergy,
                availableRenewable
            );


        const gridForLoad =
            Math.max(
                0,
                candidateLoadEnergy -
                renewableForLoad
            );


        renewableGeneration +=
            renewableGenerationInOverlap;


        renewableSurplus +=
            renewableSurplusInOverlap;


        renewableEnergyAvailable +=
            availableRenewable;


        renewableEnergyUsed +=
            renewableForLoad;


        gridEnergy +=
            gridForLoad;


        reservedLoad +=
            candidateLoadEnergy;


        coveredMinutes +=
            overlapMinutes;


        slotCount++;
    }


    if (
        coveredMinutes <
        durationMinutes
    ) {

        return null;
    }


    const renewableCoverage =
        requiredEnergy > 0

            ? (
                renewableEnergyUsed /
                requiredEnergy
            ) * 100

            : 0;


    const gridDependency =
        requiredEnergy > 0

            ? (
                gridEnergy /
                requiredEnergy
            ) * 100

            : 0;


    const renewableUtilizationPotential =
        renewableGeneration > 0

            ? (
                renewableEnergyUsed /
                renewableGeneration
            ) * 100

            : 0;


    return {

        start:
            candidateStart,

        end:
            candidateEnd,

        requiredEnergy:
            requiredEnergy,

        renewableGeneration:
            renewableGeneration,

        renewableSurplus:
            renewableSurplus,

        renewableEnergyAvailable:
            renewableEnergyAvailable,

        renewableEnergyUsed:
            renewableEnergyUsed,

        gridEnergy:
            gridEnergy,

        reservedLoad:
            reservedLoad,

        renewableCoverage:
            renewableCoverage,

        gridDependency:
            gridDependency,

        renewableUtilizationPotential:
            renewableUtilizationPotential,

        coveredMinutes:
            coveredMinutes,

        slotCount:
            slotCount
    };
}


// ==================================================
// OPTIMIZER SCORE
// ==================================================

function calculateCandidateScore(
    candidate,
    appliance
) {

    const priorityWeight =
        getPriorityWeight(
            appliance.priority
        );


    const preferredStart =
        timeToMinutes(
            appliance.preferred_start
        );


    const preferredEnd =
        timeToMinutes(
            appliance.preferred_end
        );


    const totalWindow =
        Math.max(
            1,
            preferredEnd -
            preferredStart
        );


    const timePosition =
        clamp(
            (
                candidate.start -
                preferredStart
            ) /
            totalWindow,
            0,
            1
        );


    /*
        Score composition:

        Renewable coverage: 60
        Grid reduction:      20
        Priority:            10
        Time preference:     10

        Renewable coverage remains dominant.
    */

    const renewableScore =
        clamp(
            candidate.renewableCoverage /
            100,
            0,
            1
        ) * 60;


    const gridScore =
        clamp(
            1 -
            (
                candidate.gridDependency /
                100
            ),
            0,
            1
        ) * 20;


    const priorityScore =
        priorityWeight *
        10;


    const timeScore =
        (
            1 -
            (
                timePosition *
                0.15
            )
        ) * 10;


    const score =
        Math.min(
            100,
            Math.round(
                renewableScore +
                gridScore +
                priorityScore +
                timeScore
            )
        );


    return {

        score,

        components: {

            renewable:
                round(
                    renewableScore
                ),

            grid:
                round(
                    gridScore
                ),

            priority:
                round(
                    priorityScore
                ),

            time:
                round(
                    timeScore
                )
        }
    };
}


// ==================================================
// RESERVE SELECTED CANDIDATE
// ==================================================

function reserveCandidate(
    candidate,
    appliance,
    energySlots
) {

    const powerKW =
        Math.max(
            0,
            safeNumber(
                appliance.power_consumption
            )
        );


    for (
        const slot
        of energySlots
    ) {

        const overlapStart =
            Math.max(
                candidate.start,
                slot.startMinute
            );


        const overlapEnd =
            Math.min(
                candidate.end,
                slot.endMinute
            );


        const overlapMinutes =
            Math.max(
                0,
                overlapEnd -
                overlapStart
            );


        if (
            overlapMinutes <= 0
        ) {

            continue;
        }


        const fraction =
            overlapMinutes /
            60;


        const loadEnergy =
            powerKW *
            fraction;


        const availableRenewable =
            Math.max(
                0,
                slot.renewableSurplus -
                slot.reservedRenewable
            );


        const renewableAllocated =
            Math.min(
                loadEnergy,
                availableRenewable
            );


        slot.reservedRenewable +=
            renewableAllocated;


        slot.reservedLoad +=
            loadEnergy;
    }
}


// ==================================================
// RECOMMENDATION REASON
// ==================================================

function buildRecommendationReason(
    candidate,
    appliance
) {

    const reasons = [];


    if (
        candidate.renewableCoverage >=
        80
    ) {

        reasons.push(
            "High renewable coverage"
        );

    } else if (
        candidate.renewableCoverage >=
        50
    ) {

        reasons.push(
            "Good renewable coverage"
        );

    } else if (
        candidate.renewableCoverage > 0
    ) {

        reasons.push(
            "Partial renewable coverage"
        );

    } else {

        reasons.push(
            "No renewable surplus available"
        );
    }


    if (
        candidate.renewableEnergyUsed >
        0
    ) {

        reasons.push(
            "Uses available renewable surplus"
        );
    }


    if (
        candidate.gridDependency <=
        20
    ) {

        reasons.push(
            "Low estimated grid dependency"
        );
    }


    if (
        appliance.priority ===
        "High"
    ) {

        reasons.push(
            "High-priority appliance"
        );

    } else if (
        appliance.priority ===
        "Medium"
    ) {

        reasons.push(
            "Medium-priority appliance"
        );
    }


    reasons.push(
        "Within preferred operating window"
    );


    return reasons.join(
        "; "
    );
}


// ==================================================
// PEAK RENEWABLE WINDOW
// ==================================================

function calculatePeakRenewableWindow(
    energyRows
) {

    if (
        energyRows.length === 0
    ) {

        return null;
    }


    let highest =
        energyRows[0];


    for (
        const reading
        of energyRows
    ) {

        if (
            safeNumber(
                reading.renewable_generation
            ) >
            safeNumber(
                highest.renewable_generation
            )
        ) {

            highest =
                reading;
        }
    }


    return {

        time:
            highest.reading_time,

        renewableGeneration:
            round(
                safeNumber(
                    highest.renewable_generation
                )
            ),

        energyConsumption:
            round(
                safeNumber(
                    highest.energy_consumption
                )
            ),

        gridImport:
            round(
                safeNumber(
                    highest.grid_import
                )
            ),

        renewableSurplus:
            calculateIntervalMetrics(
                highest
            ).renewableSurplus
    };
}


// ==================================================
// OPTIMIZER BASELINE
// ==================================================

function calculateOptimizerBaseline(
    energyRows
) {

    const summary =
        calculateEnergySummary(
            energyRows
        );


    return {

        totalRenewableGeneration:
            summary.totalRenewableGeneration,

        totalConsumption:
            summary.totalEnergyConsumption,

        totalGridImport:
            summary.totalGridImport,

        totalRenewableUsed:
            summary.totalRenewableUsed,

        totalRenewableSurplus:
            summary.totalRenewableSurplus,

        renewableUtilization:
            summary.renewableUtilization,

        gridDependency:
            summary.gridDependency,

        renewableShare:
            summary.renewableShare
    };
}


// ==================================================
// OPTIMIZER RESULT CALCULATION
// ==================================================

function calculateOptimizerImpact(
    baseline,
    recommendations
) {

    let flexibleEnergy =
        0;


    let renewableEnergyAllocated =
        0;


    let gridEnergyRequired =
        0;


    for (
        const recommendation
        of recommendations
    ) {

        if (
            recommendation.status !==
            "Recommended"
        ) {

            continue;
        }


        flexibleEnergy +=
            safeNumber(
                recommendation.energyRequired
            );


        renewableEnergyAllocated +=
            safeNumber(
                recommendation.renewableEnergyUsed
            );


        gridEnergyRequired +=
            safeNumber(
                recommendation.estimatedGridUsage
            );
    }


    /*
        Additional renewable usage cannot exceed
        the renewable surplus available in the
        baseline dataset.
    */

    const additionalRenewableUsage =
        Math.min(
            renewableEnergyAllocated,
            baseline.totalRenewableSurplus
        );


    const afterRenewableUsed =
        Math.min(
            baseline.totalRenewableGeneration,
            baseline.totalRenewableUsed +
            additionalRenewableUsage
        );


    const afterRenewableSurplus =
        Math.max(
            0,
            baseline.totalRenewableGeneration -
            afterRenewableUsed
        );


    const afterGridImport =
        Math.max(
            0,
            baseline.totalGridImport -
            additionalRenewableUsage
        );


    const beforeUtilization =
        baseline.totalRenewableGeneration > 0

            ? (
                baseline.totalRenewableUsed /
                baseline.totalRenewableGeneration
            ) * 100

            : 0;


    const afterUtilization =
        baseline.totalRenewableGeneration > 0

            ? (
                afterRenewableUsed /
                baseline.totalRenewableGeneration
            ) * 100

            : 0;


    const beforeGridDependency =
        baseline.totalConsumption > 0

            ? (
                baseline.totalGridImport /
                baseline.totalConsumption
            ) * 100

            : 0;


    const afterGridDependency =
        baseline.totalConsumption > 0

            ? (
                afterGridImport /
                baseline.totalConsumption
            ) * 100

            : 0;


    const estimatedCO2Reduction =
        additionalRenewableUsage *
        GRID_EMISSION_FACTOR;


    return {

        flexibleEnergy:
            round(
                flexibleEnergy
            ),

        renewableEnergyAllocated:
            round(
                renewableEnergyAllocated
            ),

        additionalRenewableUsage:
            round(
                additionalRenewableUsage
            ),

        beforeRenewableUtilization:
            round(
                beforeUtilization
            ),

        afterRenewableUtilization:
            round(
                afterUtilization
            ),

        utilizationImprovement:
            round(
                afterUtilization -
                beforeUtilization
            ),

        beforeGridDependency:
            round(
                beforeGridDependency
            ),

        afterGridDependency:
            round(
                afterGridDependency
            ),

        gridReduction:
            round(
                additionalRenewableUsage
            ),

        afterGridImport:
            round(
                afterGridImport
            ),

        afterRenewableSurplus:
            round(
                afterRenewableSurplus
            ),

        estimatedCO2ReductionKg:
            round(
                estimatedCO2Reduction
            ),

        gridEnergyRequired:
            round(
                gridEnergyRequired
            )
    };
}


// ==================================================
// BASIC SERVER TEST
// ==================================================

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "../frontend/index.html"
            )
        );
    }
);


// ==================================================
// DATABASE CONNECTION TEST
// ==================================================

app.get(
    "/api/health",
    async (req, res) => {

        let connection;


        try {

            connection =
                await pool.getConnection();


            await connection.query(
                "SELECT 1"
            );


            res.json({

                status:
                    "success",

                message:
                    "Urja Mitra backend is connected to MySQL successfully",

                system: {

                    name:
                        "Urja Mitra",

                    backend:
                        "Node.js + Express.js",

                    database:
                        "MySQL",

                    optimizer:
                        "Rule-based renewable energy optimizer",

                    optimizerResolutionMinutes:
                        OPTIMIZER_SLOT_MINUTES,

                    emissionFactor:
                        GRID_EMISSION_FACTOR,

                    emissionFactorUnit:
                        GRID_EMISSION_FACTOR_UNIT,

                    emissionFactorPeriod:
                        GRID_EMISSION_FACTOR_PERIOD
                }
            });


        } catch (error) {

            console.error(
                "Database connection error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Database connection failed",

                error:
                    error.message
            });


        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);


// ==================================================
// ENERGY API
// ==================================================

app.get(
    "/api/energy",
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(`

                    SELECT
                        id,
                        reading_date,
                        reading_time,
                        renewable_generation,
                        energy_consumption,
                        grid_import

                    FROM energy_generation

                    ORDER BY
                        reading_date,
                        reading_time

                `);


            const validation =
                validateEnergyDataset(
                    rows
                );


            const processedRows =
                rows.map(
                    reading => ({

                        ...reading,

                        energyMetrics:
                            calculateIntervalMetrics(
                                reading
                            )
                    })
                );


            const summary =
                calculateEnergySummary(
                    rows
                );


            res.json({

                status:
                    "success",

                count:
                    processedRows.length,

                data:
                    processedRows,

                calculationInfo: {

                    unit:
                        "kWh per source interval",

                    balanceTolerance:
                        ENERGY_BALANCE_TOLERANCE,

                    emissionFactor:
                        GRID_EMISSION_FACTOR,

                    emissionFactorUnit:
                        GRID_EMISSION_FACTOR_UNIT,

                    emissionFactorSource:
                        GRID_EMISSION_FACTOR_SOURCE,

                    emissionFactorPeriod:
                        GRID_EMISSION_FACTOR_PERIOD
                },

                dataValidation: {

                    valid:
                        validation.valid,

                    totalReadings:
                        validation.totalReadings,

                    invalidReadings:
                        validation.invalidCount,

                    diagnostics:
                        validation.invalidReadings
                },

                summary: {

                    totalRenewableGeneration:
                        summary.totalRenewableGeneration,

                    totalEnergyConsumption:
                        summary.totalEnergyConsumption,

                    totalGridImport:
                        summary.totalGridImport,

                    totalRenewableUsed:
                        summary.totalRenewableUsed,

                    totalRenewableSurplus:
                        summary.totalRenewableSurplus,

                    renewableUtilization:
                        summary.renewableUtilization,

                    renewableShare:
                        summary.renewableShare,

                    gridDependency:
                        summary.gridDependency,

                    dataQualityPercent:
                        summary.dataQualityPercent
                }
            });


        } catch (error) {

            console.error(
                "Energy data error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Unable to fetch energy data",

                error:
                    error.message
            });
        }
    }
);


// ==================================================
// APPLIANCES API
// ==================================================

app.get(
    "/api/appliances",
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(`

                    SELECT
                        id,
                        appliance_name,
                        power_consumption,
                        priority,
                        flexible,
                        preferred_start,
                        preferred_end,
                        duration_minutes

                    FROM appliances

                    ORDER BY id

                `);


            const processedRows =
                rows.map(
                    appliance => ({

                        ...appliance,

                        energyModel:
                            calculateApplianceEnergy(
                                appliance
                            ),

                        validation:
                            validateApplianceConfiguration(
                                appliance
                            )
                    })
                );


            res.json({

                status:
                    "success",

                count:
                    processedRows.length,

                data:
                    processedRows
            });


        } catch (error) {

            console.error(
                "Appliances data error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Unable to fetch appliance data",

                error:
                    error.message
            });
        }
    }
);


// ==================================================
// ENERGY ALERTS API
// ==================================================

app.get(
    "/api/alerts",
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(`

                    SELECT
                        id,
                        alert_type,
                        alert_message,
                        alert_time,
                        severity,
                        is_resolved

                    FROM energy_alerts

                    ORDER BY
                        alert_time DESC

                `);


            res.json({

                status:
                    "success",

                count:
                    rows.length,

                data:
                    rows
            });


        } catch (error) {

            console.error(
                "Alerts data error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Unable to fetch energy alerts",

                error:
                    error.message
            });
        }
    }
);


// ==================================================
// SCHEDULE API - GET
// ==================================================

app.get(
    "/api/schedules",
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(`

                    SELECT
                        s.id,
                        s.appliance_id,
                        a.appliance_name,
                        a.power_consumption,
                        a.priority,
                        a.flexible,
                        a.preferred_start,
                        a.preferred_end,
                        a.duration_minutes,
                        s.scheduled_date,
                        s.start_time,
                        s.end_time,
                        s.renewable_available,
                        s.estimated_grid_usage,
                        s.optimization_score,
                        s.reason

                    FROM schedules s

                    INNER JOIN appliances a
                        ON s.appliance_id = a.id

                    ORDER BY
                        s.scheduled_date,
                        s.start_time

                `);


            res.json({

                status:
                    "success",

                count:
                    rows.length,

                data:
                    rows
            });


        } catch (error) {

            console.error(
                "Schedules data error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Unable to fetch schedule data",

                error:
                    error.message
            });
        }
    }
);


// ==================================================
// SCHEDULE API - CREATE
// ==================================================

app.post(
    "/api/schedules",
    async (req, res) => {

        try {

            const {

                appliance_id,
                scheduled_date,
                start_time,
                end_time,
                renewable_available,
                estimated_grid_usage,
                optimization_score,
                reason

            } = req.body;


            const normalizedScheduledDate =
                normalizeDateOnly(
                    scheduled_date
                );


            // ------------------------------------------
            // BASIC VALIDATION
            // ------------------------------------------

            if (
                appliance_id === undefined ||
                appliance_id === null ||
                appliance_id === "" ||
                !scheduled_date ||
                !start_time ||
                !end_time ||
                renewable_available === undefined ||
                renewable_available === null
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Required schedule fields are missing"
                });
            }


            if (
                !isFiniteNumber(
                    appliance_id
                ) ||
                Number(
                    appliance_id
                ) <= 0
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Invalid appliance ID"
                });
            }


            if (
                !isValidDate(
                    normalizedScheduledDate
                )
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Invalid scheduled date. Expected YYYY-MM-DD."
                });
            }


            if (
                !isValidTime(start_time) ||
                !isValidTime(end_time)
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Invalid schedule time"
                });
            }


            if (
                timeToMinutes(end_time) <=
                timeToMinutes(start_time)
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "End time must be later than start time"
                });
            }


            if (
                !isNonNegativeNumber(
                    renewable_available
                )
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Renewable available must be a valid non-negative number"
                });
            }


            if (
                estimated_grid_usage !==
                undefined &&
                estimated_grid_usage !==
                null &&
                !isNonNegativeNumber(
                    estimated_grid_usage
                )
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Estimated grid usage must be a valid non-negative number"
                });
            }


            if (
                optimization_score !==
                undefined &&
                optimization_score !==
                null &&
                !isFiniteNumber(
                    optimization_score
                )
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Optimization score must be a valid number"
                });
            }


            if (
                reason !==
                undefined &&
                reason !==
                null
            ) {

                if (
                    typeof reason !==
                    "string"
                ) {

                    return res.status(400).json({

                        status:
                            "error",

                        message:
                            "Schedule reason must be text"
                    });
                }


                if (
                    reason.length >
                    MAX_REASON_LENGTH
                ) {

                    return res.status(400).json({

                        status:
                            "error",

                        message:
                            `Schedule reason must not exceed ${MAX_REASON_LENGTH} characters`
                    });
                }
            }


            // ------------------------------------------
            // CHECK APPLIANCE
            // ------------------------------------------

            const [applianceRows] =
                await pool.query(`

                    SELECT
                        id,
                        appliance_name,
                        power_consumption,
                        priority,
                        flexible,
                        preferred_start,
                        preferred_end,
                        duration_minutes

                    FROM appliances

                    WHERE id = ?

                    LIMIT 1

                `, [
                    appliance_id
                ]);


            if (
                applianceRows.length === 0
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Selected appliance does not exist"
                });
            }


            const appliance =
                applianceRows[0];


            const applianceValidation =
                validateApplianceConfiguration(
                    appliance
                );


            if (
                !applianceValidation.valid
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Selected appliance has invalid configuration",

                    details:
                        applianceValidation.problems
                });
            }


            const scheduleStart =
                timeToMinutes(
                    start_time
                );


            const scheduleEnd =
                timeToMinutes(
                    end_time
                );


            const requestedDuration =
                scheduleEnd -
                scheduleStart;


            const applianceDuration =
                Math.max(
                    1,
                    safeNumber(
                        appliance.duration_minutes,
                        1
                    )
                );


            if (
                requestedDuration !==
                applianceDuration
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        `Schedule duration must match the appliance duration of ${applianceDuration} minutes`
                });
            }


            // ------------------------------------------
            // PREFERRED OPERATING WINDOW
            // ------------------------------------------

            const preferredStart =
                timeToMinutes(
                    appliance.preferred_start
                );


            const preferredEnd =
                timeToMinutes(
                    appliance.preferred_end
                );


            if (
                !isWithinWindow(
                    scheduleStart,
                    scheduleEnd,
                    preferredStart,
                    preferredEnd
                )
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        `Schedule must remain within the appliance's preferred operating window of ${appliance.preferred_start} to ${appliance.preferred_end}`
                });
            }


            // ------------------------------------------
            // CONFLICT CHECK
            // ------------------------------------------

            const [conflictRows] =
                await pool.query(`

                    SELECT
                        id,
                        appliance_id,
                        start_time,
                        end_time

                    FROM schedules

                    WHERE
                        scheduled_date = ?

                        AND
                        appliance_id = ?

                        AND
                        start_time < ?

                        AND
                        end_time > ?

                `, [

                    normalizedScheduledDate,

                    appliance_id,

                    end_time,

                    start_time
                ]);


            if (
                conflictRows.length > 0
            ) {

                return res.status(409).json({

                    status:
                        "error",

                    message:
                        "A schedule for this appliance already overlaps the requested time window",

                    conflicts:
                        conflictRows
                });
            }


            // ------------------------------------------
            // INSERT SCHEDULE
            // ------------------------------------------

            const [result] =
                await pool.query(`

                    INSERT INTO schedules (

                        appliance_id,
                        scheduled_date,
                        start_time,
                        end_time,
                        renewable_available,
                        estimated_grid_usage,
                        optimization_score,
                        reason

                    )

                    VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?
                    )

                `, [

                    appliance_id,

                    normalizedScheduledDate,

                    start_time,

                    end_time,

                    Math.max(
                        0,
                        Number(
                            renewable_available
                        )
                    ),

                    estimated_grid_usage !==
                    undefined &&
                    estimated_grid_usage !==
                    null

                        ? Math.max(
                            0,
                            Number(
                                estimated_grid_usage
                            )
                        )

                        : 0,

                    optimization_score !==
                    undefined &&
                    optimization_score !==
                    null

                        ? clamp(
                            optimization_score,
                            0,
                            100
                        )

                        : null,

                    reason ||
                    null

                ]);


            res.status(201).json({

                status:
                    "success",

                message:
                    "Schedule created successfully",

                schedule_id:
                    result.insertId
            });


        } catch (error) {

            console.error(
                "Schedule creation error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Unable to create schedule",

                error:
                    error.message
            });
        }
    }
);


// ==================================================
// DASHBOARD SUMMARY API
// ==================================================

app.get(
    "/api/dashboard-summary",
    async (req, res) => {

        try {

            const [energyRows] =
                await pool.query(`

                    SELECT
                        id,
                        reading_date,
                        reading_time,
                        renewable_generation,
                        energy_consumption,
                        grid_import

                    FROM energy_generation

                    ORDER BY
                        reading_date,
                        reading_time

                `);


            const [applianceRows] =
                await pool.query(`

                    SELECT
                        COUNT(*) AS total_appliances

                    FROM appliances

                `);


            const [alertRows] =
                await pool.query(`

                    SELECT

                        COUNT(*) AS total_alerts,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN is_resolved = FALSE
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS unresolved_alerts

                    FROM energy_alerts

                `);


            const [scheduleRows] =
                await pool.query(`

                    SELECT
                        COUNT(*) AS total_schedules

                    FROM schedules

                `);


            const energy =
                calculateEnergySummary(
                    energyRows
                );


            res.json({

                status:
                    "success",

                summary: {

                    totalRenewableGeneration:
                        energy.totalRenewableGeneration,

                    totalEnergyConsumption:
                        energy.totalEnergyConsumption,

                    totalGridImport:
                        energy.totalGridImport,

                    renewableUtilization:
                        energy.renewableUtilization,

                    gridDependency:
                        energy.gridDependency,

                    renewableShare:
                        energy.renewableShare,

                    estimatedCO2AvoidedKg:
                        energy.estimatedCO2AvoidedKg,

                    totalAppliances:
                        Number(
                            applianceRows[0]
                                .total_appliances
                        ),

                    totalAlerts:
                        Number(
                            alertRows[0]
                                .total_alerts
                        ),

                    unresolvedAlerts:
                        Number(
                            alertRows[0]
                                .unresolved_alerts
                        ),

                    totalSchedules:
                        Number(
                            scheduleRows[0]
                                .total_schedules
                        ),

                    readings:
                        energy.readings,

                    totalRenewableUsed:
                        energy.totalRenewableUsed,

                    totalRenewableSurplus:
                        energy.totalRenewableSurplus,

                    totalCalculatedGridImport:
                        energy.totalCalculatedGridImport,

                    balancedReadings:
                        energy.balancedReadings,

                    unbalancedReadings:
                        energy.unbalancedReadings,

                    dataQualityPercent:
                        energy.dataQualityPercent,

                    totalBalanceDifference:
                        energy.totalBalanceDifference

                },

                calculationInfo: {

                    emissionFactor:
                        GRID_EMISSION_FACTOR,

                    emissionFactorUnit:
                        GRID_EMISSION_FACTOR_UNIT,

                    emissionFactorSource:
                        GRID_EMISSION_FACTOR_SOURCE,

                    emissionFactorPeriod:
                        GRID_EMISSION_FACTOR_PERIOD
                }
            });


        } catch (error) {

            console.error(
                "Dashboard summary error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Unable to generate dashboard summary",

                error:
                    error.message
            });
        }
    }
);


// ==================================================
// URJA MITRA OPTIMIZER API
// ==================================================

app.get(
    "/api/optimizer",
    async (req, res) => {

        try {

            // ==================================================
            // DATE SELECTION
            // ==================================================

            let requestedDate =
                req.query.date;

            if (requestedDate) {
                requestedDate =
                    normalizeDateOnly(requestedDate);
            }


            if (
                req.query.date &&
                !requestedDate
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Invalid optimizer date. Use YYYY-MM-DD."
                });
            }


            /*
                If no date is supplied, use the latest
                available energy dataset.
            */

            let dateCondition = "";
            let dateParameters = [];


            if (requestedDate) {

                dateCondition =
                    "WHERE reading_date = ?";

                dateParameters = [
                    requestedDate
                ];

            } else {

                dateCondition = `
                    WHERE reading_date = (
                        SELECT MAX(reading_date)
                        FROM energy_generation
                    )
                `;
            }


            // ==================================================
            // ENERGY DATA
            // ==================================================

            const [energyRows] =
                await pool.query(`

                    SELECT
                        id,
                        reading_date,
                        reading_time,
                        renewable_generation,
                        energy_consumption,
                        grid_import

                    FROM energy_generation

                    ${dateCondition}

                    ORDER BY
                        reading_time

                `, dateParameters);


            // ==================================================
            // APPLIANCES
            // ==================================================

            let [applianceRows] =
                await pool.query(`

                    SELECT
                        id,
                        appliance_name,
                        power_consumption,
                        priority,
                        flexible,
                        preferred_start,
                        preferred_end,
                        duration_minutes

                    FROM appliances

                    ORDER BY

                        CASE priority

                            WHEN 'High'
                                THEN 1

                            WHEN 'Medium'
                                THEN 2

                            WHEN 'Low'
                                THEN 3

                            ELSE 4

                        END,

                        id

                `);


            // ==================================================
            // EXISTING SCHEDULES
            // ==================================================

            const optimizerDate =
                energyRows.length > 0
                    ? energyRows[0].reading_date
                    : requestedDate;


            let existingSchedules = [];


            if (
                optimizerDate
            ) {

                const [scheduleRows] =
                    await pool.query(`

                        SELECT
                            id,
                            appliance_id,
                            scheduled_date,
                            start_time,
                            end_time,
                            renewable_available,
                            estimated_grid_usage,
                            optimization_score,
                            reason

                        FROM schedules

                        WHERE scheduled_date = ?

                        ORDER BY start_time

                    `, [
                        optimizerDate
                    ]);


                existingSchedules =
                    scheduleRows;
            }


            // ==================================================
            // BASIC CHECKS
            // ==================================================

            if (
                energyRows.length === 0
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "No energy data available for optimization"
                });
            }


            if (
                applianceRows.length === 0
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "No appliances available for optimization"
                });
            }


            // ==================================================
            // SOURCE DATA VALIDATION
            // ==================================================

            const energyValidation =
                validateEnergyDataset(
                    energyRows
                );


            const invalidAppliances =
                applianceRows.filter(
                    appliance =>
                        !validateApplianceConfiguration(
                            appliance
                        ).valid
                );


            if (
                !energyValidation.valid
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Energy dataset contains invalid values",

                    dataValidation:
                        energyValidation
                });
            }


            const invalidApplianceDetails =
                invalidAppliances.map(
                    appliance => ({

                        applianceId:
                            appliance.id,

                        applianceName:
                            appliance.appliance_name,

                        validation:
                            validateApplianceConfiguration(
                                appliance
                            )
                    })
                );


            // One bad appliance configuration should not
            // bring down the entire optimizer. Keep valid
            // appliances operational and report the skipped
            // configurations as diagnostics.
            applianceRows =
                applianceRows.filter(
                    appliance =>
                        validateApplianceConfiguration(
                            appliance
                        ).valid
                );


            if (
                applianceRows.length === 0
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "No valid appliances are available for optimization",

                    appliances:
                        invalidApplianceDetails
                });
            }


            // ==================================================
            // BUILD 15-MINUTE ENERGY MODEL
            // ==================================================

            const energySlots =
                buildEnergySlots(
                    energyRows
                );


            // ==================================================
            // BUILD APPLIANCE LOOKUP
            // ==================================================

            const applianceMap =
                new Map();


            applianceRows.forEach(
                appliance => {

                    applianceMap.set(
                        Number(
                            appliance.id
                        ),
                        appliance
                    );
                }
            );


            // ==================================================
            // RESERVE EXISTING SCHEDULES
            // ==================================================

            const scheduledApplianceIds =
                reserveExistingSchedules(
                    existingSchedules,
                    applianceMap,
                    energySlots
                );


            // ==================================================
            // BASELINE
            // ==================================================

            const baseline =
                calculateOptimizerBaseline(
                    energyRows
                );


            // ==================================================
            // RECOMMENDATIONS
            // ==================================================

            const recommendations = [];


            let diagnosticCandidateCount =
                0;


            // ==================================================
            // NON-FLEXIBLE APPLIANCES
            // ==================================================

            for (
                const appliance
                of applianceRows
            ) {

                if (
                    !appliance.flexible ||
                    Number(
                        appliance.flexible
                    ) === 0
                ) {

                    const model =
                        calculateApplianceEnergy(
                            appliance
                        );


                    const alreadyScheduled =
                        scheduledApplianceIds.has(
                            Number(
                                appliance.id
                            )
                        );


                    recommendations.push({

                        applianceId:
                            appliance.id,

                        applianceName:
                            appliance.appliance_name,

                        priority:
                            appliance.priority,

                        recommendedStart:
                            appliance.preferred_start,

                        recommendedEnd:
                            appliance.preferred_end,

                        renewableAvailable:
                            0,

                        renewableEnergyUsed:
                            0,

                        energyRequired:
                            model.energyKWh,

                        estimatedGridUsage:
                            model.energyKWh,

                        renewableCoverage:
                            0,

                        gridDependency:
                            100,

                        optimizationScore:
                            0,

                        status:
                            alreadyScheduled
                                ? "Already Scheduled"
                                : "Fixed",

                        reason:
                            alreadyScheduled

                                ? "This appliance already has a saved schedule for the selected date and is not shifted by the optimizer."

                                : "This appliance is marked as non-flexible and is not shifted by the optimizer.",

                        energyModel: {

                            powerKW:
                                model.powerKW,

                            durationMinutes:
                                model.durationMinutes,

                            durationHours:
                                model.durationHours,

                            energyKWh:
                                model.energyKWh
                        }
                    });
                }
            }


            // ==================================================
            // FLEXIBLE APPLIANCES
            // ==================================================

            const flexibleAppliances =
                applianceRows.filter(
                    appliance =>
                        Boolean(
                            appliance.flexible
                        )
                );


            for (
                const appliance
                of flexibleAppliances
            ) {

                /*
                    If the appliance already has a saved
                    schedule for this date, do not create
                    another recommendation for it.
                */

                if (
                    scheduledApplianceIds.has(
                        Number(
                            appliance.id
                        )
                    )
                ) {

                    const model =
                        calculateApplianceEnergy(
                            appliance
                        );


                    const existingSchedule =
                        existingSchedules.find(
                            schedule =>
                                Number(
                                    schedule.appliance_id
                                ) ===
                                Number(
                                    appliance.id
                                )
                        );


                    recommendations.push({

                        applianceId:
                            appliance.id,

                        applianceName:
                            appliance.appliance_name,

                        priority:
                            appliance.priority,

                        recommendedStart:
                            existingSchedule
                                ? existingSchedule.start_time
                                : appliance.preferred_start,

                        recommendedEnd:
                            existingSchedule
                                ? existingSchedule.end_time
                                : appliance.preferred_end,

                        renewableAvailable:
                            existingSchedule
                                ? round(
                                    safeNumber(
                                        existingSchedule.renewable_available
                                    )
                                )
                                : 0,

                        renewableEnergyUsed:
                            existingSchedule
                                ? round(
                                    Math.max(
                                        0,
                                        Math.min(
                                            model.energyKWh,
                                            safeNumber(
                                                existingSchedule.renewable_available
                                            )
                                        )
                                    )
                                )
                                : 0,

                        energyRequired:
                            model.energyKWh,

                        estimatedGridUsage:
                            existingSchedule
                                ? round(
                                    safeNumber(
                                        existingSchedule.estimated_grid_usage
                                    )
                                )
                                : model.energyKWh,

                        renewableCoverage:
                            existingSchedule &&
                            model.energyKWh > 0

                                ? round(
                                    (
                                        Math.min(
                                            model.energyKWh,
                                            Math.max(
                                                0,
                                                safeNumber(
                                                    existingSchedule.renewable_available
                                                )
                                            )
                                        ) /
                                        model.energyKWh
                                    ) * 100
                                )

                                : 0,

                        gridDependency:
                            existingSchedule &&
                            model.energyKWh > 0

                                ? round(
                                    (
                                        safeNumber(
                                            existingSchedule.estimated_grid_usage
                                        ) /
                                        model.energyKWh
                                    ) * 100
                                )

                                : 100,

                        optimizationScore:
                            existingSchedule
                                ? round(
                                    safeNumber(
                                        existingSchedule.optimization_score
                                    )
                                )
                                : 0,

                        status:
                            "Already Scheduled",

                        reason:
                            "A schedule for this appliance already exists for the selected date. The optimizer preserved the saved schedule instead of creating a duplicate recommendation.",

                        energyModel: {

                            powerKW:
                                model.powerKW,

                            durationMinutes:
                                model.durationMinutes,

                            durationHours:
                                model.durationHours,

                            energyKWh:
                                model.energyKWh
                        }
                    });


                    continue;
                }


                const preferredStart =
                    timeToMinutes(
                        appliance.preferred_start
                    );


                const preferredEnd =
                    timeToMinutes(
                        appliance.preferred_end
                    );


                const model =
                    calculateApplianceEnergy(
                        appliance
                    );


                const duration =
                    model.durationMinutes;


                /*
                    A valid candidate must fit completely
                    inside the preferred operating window.
                */

                const candidateStarts = [];


                for (
                    let start =
                        preferredStart;

                    start + duration <=
                    preferredEnd;

                    start +=
                    OPTIMIZER_STEP_MINUTES
                ) {

                    candidateStarts.push(
                        start
                    );
                }


                let bestCandidate =
                    null;


                let bestScore =
                    -Infinity;


                // ==================================================
                // EVALUATE ALL CANDIDATES
                // ==================================================

                for (
                    const candidateStart
                    of candidateStarts
                ) {

                    const candidateEnd =
                        candidateStart +
                        duration;


                    const candidate =
                        evaluateCandidate(
                            appliance,
                            candidateStart,
                            candidateEnd,
                            energySlots
                        );


                    if (!candidate) {
                        continue;
                    }


                    const scoring =
                        calculateCandidateScore(
                            candidate,
                            appliance
                        );


                    candidate.score =
                        scoring.score;


                    candidate.scoreComponents =
                        scoring.components;


                    diagnosticCandidateCount++;


                    if (
                        diagnosticCandidateCount >
                        MAX_DIAGNOSTIC_CANDIDATES
                    ) {

                        break;
                    }


                    // ------------------------------------------
                    // CANDIDATE COMPARISON
                    // ------------------------------------------

                    const candidateScore =
                        candidate.score;


                    if (
                        !bestCandidate
                    ) {

                        bestCandidate =
                            candidate;

                        bestScore =
                            candidateScore;

                        continue;
                    }


                    const sameScore =
                        candidateScore ===
                        bestScore;


                    const moreRenewable =
                        candidate.renewableEnergyUsed >
                        bestCandidate.renewableEnergyUsed;


                    const sameRenewable =
                        Math.abs(
                            candidate.renewableEnergyUsed -
                            bestCandidate.renewableEnergyUsed
                        ) < 0.0001;


                    const lowerGrid =
                        candidate.gridEnergy <
                        bestCandidate.gridEnergy;


                    const earlierStart =
                        candidate.start <
                        bestCandidate.start;


                    if (

                        candidateScore >
                        bestScore

                        ||

                        (
                            sameScore &&
                            moreRenewable
                        )

                        ||

                        (
                            sameScore &&
                            sameRenewable &&
                            lowerGrid
                        )

                        ||

                        (
                            sameScore &&
                            sameRenewable &&
                            !lowerGrid &&
                            earlierStart
                        )

                    ) {

                        bestCandidate =
                            candidate;

                        bestScore =
                            candidateScore;
                    }
                }


                // ==================================================
                // NO SUITABLE SLOT
                // ==================================================

                if (
                    !bestCandidate
                ) {

                    recommendations.push({

                        applianceId:
                            appliance.id,

                        applianceName:
                            appliance.appliance_name,

                        priority:
                            appliance.priority,

                        recommendedStart:
                            appliance.preferred_start,

                        recommendedEnd:
                            appliance.preferred_end,

                        renewableAvailable:
                            0,

                        renewableEnergyUsed:
                            0,

                        energyRequired:
                            model.energyKWh,

                        estimatedGridUsage:
                            model.energyKWh,

                        renewableCoverage:
                            0,

                        gridDependency:
                            100,

                        optimizationScore:
                            0,

                        status:
                            "No Suitable Slot",

                        reason:
                            "No complete operating window was found inside the preferred time range.",

                        energyModel: {

                            powerKW:
                                model.powerKW,

                            durationMinutes:
                                model.durationMinutes,

                            durationHours:
                                model.durationHours,

                            energyKWh:
                                model.energyKWh
                        }
                    });


                    continue;
                }


                // ==================================================
                // RESERVE RENEWABLE CAPACITY
                // ==================================================

                reserveCandidate(
                    bestCandidate,
                    appliance,
                    energySlots
                );


                // ==================================================
                // EXPLAINABLE REASON
                // ==================================================

                const reason =
                    buildRecommendationReason(
                        bestCandidate,
                        appliance
                    );


                // ==================================================
                // FINAL RECOMMENDATION
                // ==================================================

                recommendations.push({

                    applianceId:
                        appliance.id,

                    applianceName:
                        appliance.appliance_name,

                    priority:
                        appliance.priority,

                    recommendedStart:
                        minutesToTime(
                            bestCandidate.start
                        ),

                    recommendedEnd:
                        minutesToTime(
                            bestCandidate.end
                        ),

                    renewableAvailable:
                        round(
                            bestCandidate.renewableEnergyAvailable
                        ),

                    renewableEnergyUsed:
                        round(
                            bestCandidate.renewableEnergyUsed
                        ),

                    energyRequired:
                        round(
                            bestCandidate.requiredEnergy
                        ),

                    estimatedGridUsage:
                        round(
                            bestCandidate.gridEnergy
                        ),

                    renewableCoverage:
                        round(
                            bestCandidate.renewableCoverage
                        ),

                    gridDependency:
                        round(
                            bestCandidate.gridDependency
                        ),

                    optimizationScore:
                        bestCandidate.score,

                    status:
                        "Recommended",

                    reason:
                        reason,

                    energyModel: {

                        powerKW:
                            model.powerKW,

                        durationMinutes:
                            model.durationMinutes,

                        durationHours:
                            model.durationHours,

                        energyKWh:
                            model.energyKWh
                    },

                    scoreBreakdown:
                        bestCandidate.scoreComponents
                });
            }


            // ==================================================
            // SORT BY RECOMMENDED TIME
            // ==================================================

            recommendations.sort(
                (a, b) => {

                    const timeA =
                        a.recommendedStart
                            ? timeToMinutes(
                                a.recommendedStart
                            )
                            : 9999;


                    const timeB =
                        b.recommendedStart
                            ? timeToMinutes(
                                b.recommendedStart
                            )
                            : 9999;


                    return (
                        timeA -
                        timeB
                    );
                }
            );


            // ==================================================
            // OPTIMIZER SUMMARY
            // ==================================================

            const optimizedRecommendations =
                recommendations.filter(
                    item =>
                        item.status ===
                        "Recommended"
                );


            const totalOptimizedGridUsage =
                optimizedRecommendations.reduce(
                    (
                        total,
                        item
                    ) =>

                        total +
                        safeNumber(
                            item.estimatedGridUsage
                        ),

                    0
                );


            const totalOptimizedEnergy =
                optimizedRecommendations.reduce(
                    (
                        total,
                        item
                    ) =>

                        total +
                        safeNumber(
                            item.energyRequired
                        ),

                    0
                );


            const totalRenewableEnergyUsed =
                optimizedRecommendations.reduce(
                    (
                        total,
                        item
                    ) =>

                        total +
                        safeNumber(
                            item.renewableEnergyUsed
                        ),

                    0
                );


            const averageScore =
                optimizedRecommendations.length >
                0

                    ? optimizedRecommendations.reduce(
                        (
                            total,
                            item
                        ) =>

                            total +
                            safeNumber(
                                item.optimizationScore
                            ),

                        0
                    ) /
                    optimizedRecommendations.length

                    : 0;


            const impact =
                calculateOptimizerImpact(
                    baseline,
                    recommendations
                );


            const peakRenewableWindow =
                calculatePeakRenewableWindow(
                    energyRows
                );


            // ==================================================
            // FINAL RESPONSE
            // ==================================================

            res.json({

                status:
                    "success",

                optimizer: {

                    name:
                        "Urja Mitra Optimizer",

                    mode:
                        "Rule-based renewable energy optimization",

                    resolutionMinutes:
                        OPTIMIZER_SLOT_MINUTES,

                    candidateStepMinutes:
                        OPTIMIZER_STEP_MINUTES,

                    sourceDataResolution:
                        "Hourly",

                    sourceDataAssumption:
                        "Hourly energy values are proportionally distributed across internal 15-minute planning intervals.",

                    existingSchedulesConsidered:
                        existingSchedules.length,

                    note:
                        "Recommendations are calculated planning suggestions from the available energy dataset. They are not real-time appliance control commands."
                },


                calculationInfo: {

                    energyUnit:
                        "kWh",

                    powerUnit:
                        "kW",

                    emissionFactor:
                        GRID_EMISSION_FACTOR,

                    emissionFactorUnit:
                        GRID_EMISSION_FACTOR_UNIT,

                    emissionFactorSource:
                        GRID_EMISSION_FACTOR_SOURCE,

                    emissionFactorPeriod:
                        GRID_EMISSION_FACTOR_PERIOD
                },


                date:
                    energyRows[0]
                        .reading_date,


                peakRenewableWindow:
                    peakRenewableWindow,


                summary: {

                    appliancesAnalyzed:
                        applianceRows.length,

                    appliancesOptimized:
                        optimizedRecommendations.length,

                    averageOptimizationScore:
                        round(
                            averageScore
                        ),

                    estimatedOptimizedGridUsage:
                        round(
                            totalOptimizedGridUsage
                        ),

                    estimatedOptimizedEnergy:
                        round(
                            totalOptimizedEnergy
                        ),

                    totalRenewableEnergyUsed:
                        round(
                            totalRenewableEnergyUsed
                        ),

                    estimatedBeforeRenewableUtilization:
                        impact.beforeRenewableUtilization,

                    estimatedAfterRenewableUtilization:
                        impact.afterRenewableUtilization,

                    renewableUtilizationImprovement:
                        impact.utilizationImprovement,

                    estimatedGridDependencyBefore:
                        impact.beforeGridDependency,

                    estimatedGridDependencyAfter:
                        impact.afterGridDependency,

                    estimatedGridReduction:
                        impact.gridReduction,

                    estimatedAdditionalRenewableUsage:
                        impact.additionalRenewableUsage,

                    estimatedCO2ReductionKg:
                        impact.estimatedCO2ReductionKg,

                    remainingRenewableSurplus:
                        impact.afterRenewableSurplus,

                    existingSchedules:
                        existingSchedules.length
                },


                diagnostics: {

                    candidateWindowsEvaluated:
                        Math.min(
                            diagnosticCandidateCount,
                            MAX_DIAGNOSTIC_CANDIDATES
                        ),

                    optimizerResolutionMinutes:
                        OPTIMIZER_SLOT_MINUTES,

                    energyReadings:
                        energyRows.length,

                    energyDataValid:
                        energyValidation.valid,

                    invalidEnergyReadings:
                        energyValidation.invalidCount
                },


                recommendations:
                    recommendations
            });


        } catch (error) {

            console.error(
                "Optimizer error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Unable to generate optimized schedule",

                error:
                    error.message
            });
        }
    }
);


// ==================================================
// WHAT-IF OPTIMIZATION API
// ==================================================

/*
    Example:

        /api/what-if?additional_load=2

    This endpoint lets the frontend or presentation
    demonstrate the effect of adding an additional
    flexible load without modifying the database.

    The value is interpreted as additional kWh of
    flexible demand that can be shifted into the
    available renewable surplus.
*/

app.get(
    "/api/what-if",
    async (req, res) => {

        try {

            if (
                req.query.additional_load ===
                undefined
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "additional_load is required. Example: /api/what-if?additional_load=2"
                });
            }


            if (
                !isNonNegativeNumber(
                    req.query.additional_load
                )
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "additional_load must be a valid non-negative number"
                });
            }


            const additionalLoad =
                Number(
                    req.query.additional_load
                );


            if (
                additionalLoad >
                MAX_WHAT_IF_LOAD_KWH
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        `additional_load cannot exceed ${MAX_WHAT_IF_LOAD_KWH} kWh`
                });
            }


            const [energyRows] =
                await pool.query(`

                    SELECT
                        id,
                        reading_date,
                        reading_time,
                        renewable_generation,
                        energy_consumption,
                        grid_import

                    FROM energy_generation

                    WHERE reading_date = (
                        SELECT MAX(reading_date)
                        FROM energy_generation
                    )

                    ORDER BY reading_time

                `);


            if (
                energyRows.length === 0
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "No energy data available for what-if analysis"
                });
            }


            const validation =
                validateEnergyDataset(
                    energyRows
                );


            if (
                !validation.valid
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "Energy dataset contains invalid values",

                    dataValidation:
                        validation
                });
            }


            const baseline =
                calculateOptimizerBaseline(
                    energyRows
                );


            const renewableCanAbsorb =
                Math.min(
                    additionalLoad,
                    baseline.totalRenewableSurplus
                );


            const gridRequired =
                Math.max(
                    0,
                    additionalLoad -
                    renewableCanAbsorb
                );


            const resultingRenewableUtilization =
                baseline.totalRenewableGeneration >
                0

                    ? (
                        (
                            baseline.totalRenewableUsed +
                            renewableCanAbsorb
                        ) /
                        baseline.totalRenewableGeneration
                    ) * 100

                    : 0;


            const resultingGridImport =
                baseline.totalGridImport +
                gridRequired;


            const resultingConsumption =
                baseline.totalConsumption +
                additionalLoad;


            const resultingGridDependency =
                resultingConsumption > 0

                    ? (
                        resultingGridImport /
                        resultingConsumption
                    ) * 100

                    : 0;


            res.json({

                status:
                    "success",

                whatIf: {

                    additionalLoadKWh:
                        round(
                            additionalLoad
                        ),

                    renewableEnergySuppliedKWh:
                        round(
                            renewableCanAbsorb
                        ),

                    additionalGridEnergyKWh:
                        round(
                            gridRequired
                        ),

                    resultingRenewableUtilization:
                        round(
                            resultingRenewableUtilization
                        ),

                    resultingGridImport:
                        round(
                            resultingGridImport
                        ),

                    resultingGridDependency:
                        round(
                            resultingGridDependency
                        ),

                    renewableSurplusRemaining:
                        round(
                            Math.max(
                                0,
                                baseline.totalRenewableSurplus -
                                renewableCanAbsorb
                            )
                        ),

                    estimatedAdditionalCO2Kg:
                        round(
                            renewableCanAbsorb *
                            GRID_EMISSION_FACTOR
                        )
                }
            });


        } catch (error) {

            console.error(
                "What-if analysis error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Unable to generate what-if analysis",

                error:
                    error.message
            });
        }
    }
);


// ==================================================
// DAILY PLAN API
// ==================================================

/*
    Generates a presentation-friendly daily plan
    using the same optimizer logic.

    It does not create database schedules.

    This is intentionally read-only.
*/

app.get(
    "/api/daily-plan",
    async (req, res) => {

        try {

            let optimizerResponse;

            try {
                optimizerResponse = await generateDailyPlanData(req.query.date);
            } catch (primaryError) {
                console.warn("Daily plan requested-date fallback:", primaryError.message);
                optimizerResponse = await generateDailyPlanData(null);
                if (optimizerResponse && optimizerResponse.status === "success") {
                    optimizerResponse.fallbackUsed = true;
                    optimizerResponse.warnings = [
                        ...(Array.isArray(optimizerResponse.warnings) ? optimizerResponse.warnings : []),
                        "The requested date could not be used, so the latest available energy dataset was used."
                    ];
                }
            }

            res.json(optimizerResponse);


        } catch (error) {

            console.error(
                "Daily plan error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Unable to generate daily plan",

                error:
                    error.message
            });
        }
    }
);



// ==================================================
// DAILY PLAN PRINT / PDF EXPORT
// ==================================================

function escapeHtmlServer(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

app.get(
    "/daily-plan/print",
    async (req, res) => {
        try {
            let data;
            try {
                data = await generateDailyPlanData(req.query.date);
            } catch (primaryError) {
                console.warn("Daily plan print requested-date fallback:", primaryError.message);
                data = await generateDailyPlanData(null);
                if (data && data.status === "success") {
                    data.fallbackUsed = true;
                    data.warnings = [
                        ...(Array.isArray(data.warnings) ? data.warnings : []),
                        "The requested date could not be used, so the latest available energy dataset was used."
                    ];
                }
            }

            if (!data || data.status !== "success") {
                return res.status(404).send(`<!doctype html><html><body style="font-family:Arial;padding:30px;"><h2>Urja Mitra - Daily Plan</h2><p>${escapeHtmlServer(data?.message || "Daily plan unavailable")}</p></body></html>`);
            }

            const items = Array.isArray(data.plan?.items) ? data.plan.items : [];
            const rows = items.map(item => `
                <tr>
                    <td>${escapeHtmlServer(item.applianceName)}</td>
                    <td>${escapeHtmlServer(item.start || "--")} - ${escapeHtmlServer(item.end || "--")}</td>
                    <td>${escapeHtmlServer(item.status || "Planned")}</td>
                    <td>${Number(item.renewableEnergyUsed || 0).toFixed(2)}</td>
                    <td>${Number(item.estimatedGridUsage || 0).toFixed(2)}</td>
                    <td>${Number(item.optimizationScore || 0).toFixed(1)}</td>
                </tr>`).join("");

            const warningHtml = Array.isArray(data.warnings) && data.warnings.length
                ? `<div class="warning">${data.warnings.map(escapeHtmlServer).join("<br>")}</div>`
                : "";

            const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Urja Mitra - Smart Daily Energy Plan</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#18231d;margin:0;background:#fff}
.page{max-width:1000px;margin:0 auto;padding:28px}
h1{font-size:24px;margin:0 0 6px;color:#155d35}
.meta{color:#64748b;font-size:13px;margin-bottom:20px}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
.box{border:1px solid #d7e2dc;padding:12px;background:#f6faf7}
.box small{color:#64748b}.box strong{display:block;margin-top:5px}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:13px}
th,td{border:1px solid #d7e2dc;padding:9px;text-align:left}th{background:#edf4ef;color:#155d35}
.warning{padding:10px 12px;background:#fff8e6;border:1px solid #ead8a5;color:#705400;margin:14px 0;font-size:13px}
.actions{margin:20px 0}.actions button{padding:10px 16px;border:1px solid #155d35;background:#155d35;color:#fff;border-radius:4px;font-weight:600;cursor:pointer}
@media print{.actions{display:none}.page{max-width:none;padding:0}.summary{break-inside:avoid}table{break-inside:auto}tr{break-inside:avoid;break-after:auto}}
</style>
</head>
<body>
<div class="page">
    <h1>Urja Mitra — Smart Daily Energy Plan</h1>
    <div class="meta">Plan date: ${escapeHtmlServer(data.date)} · Generated by ${escapeHtmlServer(data.plan?.generatedBy || "Urja Mitra")}</div>
    ${warningHtml}
    <div class="summary">
        <div class="box"><small>Appliances planned</small><strong>${items.length}</strong></div>
        <div class="box"><small>Renewable energy used</small><strong>${items.reduce((s,x)=>s+Number(x.renewableEnergyUsed||0),0).toFixed(2)} kWh</strong></div>
        <div class="box"><small>Estimated grid use</small><strong>${items.reduce((s,x)=>s+Number(x.estimatedGridUsage||0),0).toFixed(2)} kWh</strong></div>
        <div class="box"><small>Existing schedules</small><strong>${Number(data.plan?.existingSchedulesConsidered || 0)}</strong></div>
    </div>
    <div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
    <table>
        <thead><tr><th>Appliance</th><th>Time</th><th>Status</th><th>Renewable (kWh)</th><th>Grid (kWh)</th><th>Score</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">No plan items available.</td></tr>'}</tbody>
    </table>
</div>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),350));</script>
</body>
</html>`;

            res.type("html").send(html);
        } catch (error) {
            console.error("Daily plan print error:", error.message);
            res.status(500).send(`<h2>Unable to generate Daily Plan PDF view</h2><p>${escapeHtmlServer(error.message)}</p>`);
        }
    }
);


// ==================================================
// DAILY PLAN DIAGNOSTICS
// ==================================================

app.get("/api/daily-plan/debug", async (req, res) => {
    try {
        const [latestRows] = await pool.query(`
            SELECT MAX(reading_date) AS latest_date, COUNT(*) AS total_rows
            FROM energy_generation
        `);
        const [applianceRows] = await pool.query(`
            SELECT id, appliance_name, preferred_start, preferred_end, duration_minutes
            FROM appliances
            ORDER BY id
        `);
        const invalid = applianceRows
            .map(a => ({ ...a, validation: validateApplianceConfiguration(a) }))
            .filter(a => !a.validation.valid);
        res.json({
            status: "success",
            latestEnergyDate: normalizeDateOnly(latestRows[0]?.latest_date),
            energyRowCount: Number(latestRows[0]?.total_rows || 0),
            applianceCount: applianceRows.length,
            invalidAppliances: invalid,
            receivedQueryDate: req.query.date ?? null,
            normalizedQueryDate: normalizeDateOnly(req.query.date)
        });
    } catch (error) {
        res.status(500).json({ status: "error", message: "Unable to generate daily-plan diagnostics", error: error.message });
    }
});


// ==================================================
// ENERGY ANALYSIS API
// ==================================================

app.get(
    "/api/analysis",
    async (req, res) => {

        try {

            const [energyRows] =
                await pool.query(`

                    SELECT
                        id,
                        reading_date,
                        reading_time,
                        renewable_generation,
                        energy_consumption,
                        grid_import

                    FROM energy_generation

                    ORDER BY
                        reading_date,
                        reading_time

                `);


            const validation =
                validateEnergyDataset(
                    energyRows
                );


            const summary =
                calculateEnergySummary(
                    energyRows
                );


            const peak =
                calculatePeakRenewableWindow(
                    energyRows
                );


            const wastePercentage =
                summary.totalRenewableGeneration >
                0

                    ? (
                        summary.totalRenewableSurplus /
                        summary.totalRenewableGeneration
                    ) * 100

                    : 0;


            res.json({

                status:
                    "success",

                analysis: {

                    energyBalance: {

                        renewableGeneration:
                            summary.totalRenewableGeneration,

                        renewableUsed:
                            summary.totalRenewableUsed,

                        renewableSurplus:
                            summary.totalRenewableSurplus,

                        consumption:
                            summary.totalEnergyConsumption,

                        gridImport:
                            summary.totalGridImport
                    },

                    performance: {

                        renewableUtilization:
                            summary.renewableUtilization,

                        renewableShare:
                            summary.renewableShare,

                        gridDependency:
                            summary.gridDependency,

                        renewableSurplusPercentage:
                            round(
                                wastePercentage
                            )
                    },

                    quality: {

                        readings:
                            summary.readings,

                        balancedReadings:
                            summary.balancedReadings,

                        unbalancedReadings:
                            summary.unbalancedReadings,

                        dataQualityPercent:
                            summary.dataQualityPercent,

                        totalBalanceDifference:
                            summary.totalBalanceDifference,

                        sourceDataValid:
                            validation.valid,

                        invalidSourceReadings:
                            validation.invalidCount
                    },

                    peakRenewableWindow:
                        peak,

                    environmentalImpact: {

                        estimatedCO2AvoidedKg:
                            summary.estimatedCO2AvoidedKg,

                        emissionFactor:
                            GRID_EMISSION_FACTOR,

                        emissionFactorUnit:
                            GRID_EMISSION_FACTOR_UNIT,

                        source:
                            GRID_EMISSION_FACTOR_SOURCE,

                        period:
                            GRID_EMISSION_FACTOR_PERIOD
                    }
                }
            });


        } catch (error) {

            console.error(
                "Analysis error:",
                error.message
            );


            res.status(500).json({

                status:
                    "error",

                message:
                    "Unable to generate energy analysis",

                error:
                    error.message
            });
        }
    }
);


// ==================================================
// DAILY PLAN INTERNAL GENERATOR
// ==================================================

async function generateDailyPlanData(
    requestedDate
) {

    const originalRequestedDate =
        requestedDate;

    const normalizedRequestedDate =
        normalizeDateOnly(requestedDate);

    // Daily Plan is an informational feature, so an invalid or
    // stale browser date must never prevent generation. If a client
    // sends "undefined", DD-MM-YYYY, an ISO datetime, or any other
    // malformed value, silently fall back to the latest dataset.
    requestedDate =
        normalizedRequestedDate &&
        isValidDate(normalizedRequestedDate)
            ? normalizedRequestedDate
            : null;

    const dateFallbackReason =
        originalRequestedDate && !requestedDate
            ? "The supplied date was invalid or unavailable, so the latest available energy dataset was used."
            : null;


    let dateCondition = "";
    let dateParameters = [];


    if (requestedDate) {

        dateCondition =
            "WHERE reading_date = ?";

        dateParameters = [
            requestedDate
        ];

    } else {

        dateCondition = `
            WHERE reading_date = (
                SELECT MAX(reading_date)
                FROM energy_generation
            )
        `;
    }


    const [energyRows] =
        await pool.query(`

            SELECT
                id,
                reading_date,
                reading_time,
                renewable_generation,
                energy_consumption,
                grid_import

            FROM energy_generation

            ${dateCondition}

            ORDER BY reading_time

        `, dateParameters);


    let selectedEnergyRows = energyRows;

    // If a valid requested date has no readings, do not fail the
    // whole feature. Retry once against the latest available date.
    if (selectedEnergyRows.length === 0 && requestedDate) {
        const [fallbackRows] = await pool.query(`
            SELECT
                id,
                reading_date,
                reading_time,
                renewable_generation,
                energy_consumption,
                grid_import
            FROM energy_generation
            WHERE reading_date = (SELECT MAX(reading_date) FROM energy_generation)
            ORDER BY reading_time
        `);
        selectedEnergyRows = fallbackRows;
        requestedDate = selectedEnergyRows.length
            ? normalizeDateOnly(selectedEnergyRows[0].reading_date)
            : null;
    }

    if (selectedEnergyRows.length === 0) {
        return {
            status: "error",
            message: "No energy data available for daily planning"
        };
    }

    // Use the selected rows from this point onward.
    const finalEnergyRows = selectedEnergyRows;


    let [applianceRows] =
        await pool.query(`

            SELECT
                id,
                appliance_name,
                power_consumption,
                priority,
                flexible,
                preferred_start,
                preferred_end,
                duration_minutes

            FROM appliances

            ORDER BY

                CASE priority

                    WHEN 'High'
                        THEN 1

                    WHEN 'Medium'
                        THEN 2

                    WHEN 'Low'
                        THEN 3

                    ELSE 4

                END,

                id

        `);


    const validation =
        validateEnergyDataset(
            finalEnergyRows
        );


    if (
        !validation.valid
    ) {

        return {

            status:
                "error",

            message:
                "Energy dataset contains invalid values",

            dataValidation:
                validation
        };
    }


    const invalidAppliances =
        applianceRows.filter(
            appliance =>
                !validateApplianceConfiguration(
                    appliance
                ).valid
        );


    const invalidApplianceDetails =
        invalidAppliances.map(
            appliance => ({

                applianceId:
                    appliance.id,

                applianceName:
                    appliance.appliance_name,

                validation:
                    validateApplianceConfiguration(
                        appliance
                    )
            })
        );


    // Skip only invalid appliance records so that one
    // malformed configuration cannot disable the daily plan.
    applianceRows =
        applianceRows.filter(
            appliance =>
                validateApplianceConfiguration(
                    appliance
                ).valid
        );


    if (
        applianceRows.length === 0
    ) {

        return {

            status:
                "error",

            message:
                "No valid appliances are available for daily planning",

            appliances:
                invalidApplianceDetails
        };
    }


    // ==================================================
    // EXISTING SCHEDULES
    // ==================================================

    const planDate =
        normalizeDateOnly(finalEnergyRows[0].reading_date);


    const [existingSchedules] =
        await pool.query(`

            SELECT
                id,
                appliance_id,
                scheduled_date,
                start_time,
                end_time,
                renewable_available,
                estimated_grid_usage,
                optimization_score,
                reason

            FROM schedules

            WHERE scheduled_date = ?

            ORDER BY start_time

        `, [
            planDate
        ]);


    const energySlots =
        buildEnergySlots(
            finalEnergyRows
        );


    const applianceMap =
        new Map();


    applianceRows.forEach(
        appliance => {

            applianceMap.set(
                Number(
                    appliance.id
                ),
                appliance
            );
        }
    );


    const scheduledApplianceIds =
        reserveExistingSchedules(
            existingSchedules,
            applianceMap,
            energySlots
        );


    const planItems = [];


    for (
        const appliance
        of applianceRows
    ) {

        const model =
            calculateApplianceEnergy(
                appliance
            );


        // --------------------------------------------------
        // EXISTING SCHEDULE
        // --------------------------------------------------

        if (
            scheduledApplianceIds.has(
                Number(
                    appliance.id
                )
            )
        ) {

            const existingSchedule =
                existingSchedules.find(
                    schedule =>
                        Number(
                            schedule.appliance_id
                        ) ===
                        Number(
                            appliance.id
                        )
                );


            planItems.push({

                applianceId:
                    appliance.id,

                applianceName:
                    appliance.appliance_name,

                priority:
                    appliance.priority,

                start:
                    existingSchedule
                        ? existingSchedule.start_time
                        : appliance.preferred_start,

                end:
                    existingSchedule
                        ? existingSchedule.end_time
                        : appliance.preferred_end,

                status:
                    "Already Scheduled",

                energyRequired:
                    model.energyKWh,

                renewableEnergyUsed:
                    existingSchedule
                        ? round(
                            Math.min(
                                model.energyKWh,
                                Math.max(
                                    0,
                                    safeNumber(
                                        existingSchedule.renewable_available
                                    )
                                )
                            )
                        )
                        : 0,

                estimatedGridUsage:
                    existingSchedule
                        ? round(
                            safeNumber(
                                existingSchedule.estimated_grid_usage
                            )
                        )
                        : model.energyKWh,

                renewableCoverage:
                    existingSchedule &&
                    model.energyKWh > 0

                        ? round(
                            (
                                Math.min(
                                    model.energyKWh,
                                    Math.max(
                                        0,
                                        safeNumber(
                                            existingSchedule.renewable_available
                                        )
                                    )
                                ) /
                                model.energyKWh
                            ) * 100
                        )

                        : 0,

                optimizationScore:
                    existingSchedule
                        ? round(
                            safeNumber(
                                existingSchedule.optimization_score
                            )
                        )
                        : 0
            });


            continue;
        }


        // --------------------------------------------------
        // FIXED APPLIANCES
        // --------------------------------------------------

        if (
            !appliance.flexible ||
            Number(
                appliance.flexible
            ) === 0
        ) {

            planItems.push({

                applianceId:
                    appliance.id,

                applianceName:
                    appliance.appliance_name,

                priority:
                    appliance.priority,

                start:
                    appliance.preferred_start,

                end:
                    appliance.preferred_end,

                status:
                    "Fixed",

                energyRequired:
                    model.energyKWh
            });


            continue;
        }


        const preferredStart =
            timeToMinutes(
                appliance.preferred_start
            );


        const preferredEnd =
            timeToMinutes(
                appliance.preferred_end
            );


        let best =
            null;


        for (
            let start =
                preferredStart;

            start +
            model.durationMinutes <=
            preferredEnd;

            start +=
            OPTIMIZER_STEP_MINUTES
        ) {

            const candidate =
                evaluateCandidate(
                    appliance,
                    start,
                    start +
                    model.durationMinutes,
                    energySlots
                );


            if (!candidate) {
                continue;
            }


            const scoring =
                calculateCandidateScore(
                    candidate,
                    appliance
                );


            candidate.score =
                scoring.score;


            candidate.scoreComponents =
                scoring.components;


            if (
                !best ||
                candidate.score >
                best.score ||
                (
                    candidate.score ===
                    best.score &&
                    candidate.renewableEnergyUsed >
                    best.renewableEnergyUsed
                ) ||
                (
                    candidate.score ===
                    best.score &&
                    Math.abs(
                        candidate.renewableEnergyUsed -
                        best.renewableEnergyUsed
                    ) < 0.0001 &&
                    candidate.gridEnergy <
                    best.gridEnergy
                )
            ) {

                best =
                    candidate;
            }
        }


        if (best) {

            reserveCandidate(
                best,
                appliance,
                energySlots
            );


            planItems.push({

                applianceId:
                    appliance.id,

                applianceName:
                    appliance.appliance_name,

                priority:
                    appliance.priority,

                start:
                    minutesToTime(
                        best.start
                    ),

                end:
                    minutesToTime(
                        best.end
                    ),

                status:
                    "Recommended",

                energyRequired:
                    round(
                        best.requiredEnergy
                    ),

                renewableEnergyUsed:
                    round(
                        best.renewableEnergyUsed
                    ),

                estimatedGridUsage:
                    round(
                        best.gridEnergy
                    ),

                renewableCoverage:
                    round(
                        best.renewableCoverage
                    ),

                optimizationScore:
                    best.score
            });

        } else {

            planItems.push({

                applianceId:
                    appliance.id,

                applianceName:
                    appliance.appliance_name,

                priority:
                    appliance.priority,

                start:
                    appliance.preferred_start,

                end:
                    appliance.preferred_end,

                status:
                    "No Suitable Slot",

                energyRequired:
                    model.energyKWh
            });
        }
    }


    return {

        status:
            "success",

        date:
            normalizeDateOnly(finalEnergyRows[0].reading_date),

        requestedDate:
            normalizeDateOnly(originalRequestedDate),

        fallbackUsed:
            Boolean(dateFallbackReason) ||
            Boolean(originalRequestedDate && requestedDate && normalizeDateOnly(originalRequestedDate) !== requestedDate),

        warnings:
            [
                ...(dateFallbackReason ? [dateFallbackReason] : []),
                ...(invalidApplianceDetails.length
                    ? [
                        `${invalidApplianceDetails.length} appliance configuration(s) were skipped because their operating windows are invalid.`
                    ]
                    : [])
            ],

        skippedAppliances:
            invalidApplianceDetails,

        plan: {

            generatedBy:
                "Urja Mitra Optimizer",

            summary: {
                appliancesAnalyzed: applianceRows.length + invalidApplianceDetails.length,
                appliancesOptimized: planItems.filter(item => ["Recommended", "Fixed", "Already Scheduled"].includes(item.status)).length,
                averageOptimizationScore: planItems.filter(item => Number.isFinite(Number(item.optimizationScore))).length
                    ? round(planItems.filter(item => Number.isFinite(Number(item.optimizationScore))).reduce((sum, item) => sum + Number(item.optimizationScore), 0) / planItems.filter(item => Number.isFinite(Number(item.optimizationScore))).length)
                    : 0,
                estimatedGridReduction: round(planItems.reduce((sum, item) => {
                    const required = Math.max(0, safeNumber(item.energyRequired));
                    const renewable = Math.max(0, Math.min(required, safeNumber(item.renewableEnergyUsed)));
                    return sum + renewable;
                }, 0))
            },

            resolutionMinutes:
                OPTIMIZER_SLOT_MINUTES,

            existingSchedulesConsidered:
                existingSchedules.length,

            items:
                planItems
        }
    };
}


// ==================================================
// BUILD / RUNTIME DIAGNOSTICS
// ==================================================

app.get("/api/build-info", async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT MAX(reading_date) AS latest_energy_date, COUNT(*) AS energy_row_count FROM energy_generation`);
        res.json({
            status: "success",
            buildId: URJA_BUILD_ID,
            buildVersion: URJA_BUILD_VERSION,
            serverFile: __filename,
            nodeVersion: process.version,
            latestEnergyDate: normalizeDateOnly(rows[0]?.latest_energy_date),
            energyRowCount: Number(rows[0]?.energy_row_count || 0),
            time: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            buildId: URJA_BUILD_ID,
            buildVersion: URJA_BUILD_VERSION,
            serverFile: __filename,
            nodeVersion: process.version,
            message: "Build information is available, but the database diagnostic failed.",
            error: error.message
        });
    }
});


// API 404 HANDLER
// ==================================================

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({

            status:
                "error",

            message:
                "API endpoint not found"
        });
    }
);


// ==================================================
// GENERAL ERROR HANDLER
// ==================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "Server error:",
            error.message
        );


        /*
            Express JSON parser errors are returned as
            a client-side 400 rather than a generic 500.
        */

        if (
            error instanceof SyntaxError &&
            error.status === 400 &&
            "body" in error
        ) {

            return res.status(400).json({

                status:
                    "error",

                message:
                    "Invalid JSON request body"
            });
        }


        res.status(500).json({

            status:
                "error",

            message:
                "Internal server error"
        });
    }
);


// ==================================================
// START SERVER
// ==================================================

app.listen(
    PORT,
    () => {

        console.log(
            `Urja Mitra server running at http://localhost:${PORT}`
        );

        console.log(
            `Build: ${URJA_BUILD_ID} (${URJA_BUILD_VERSION})`
        );

        console.log(
            `Optimizer resolution: ${OPTIMIZER_SLOT_MINUTES} minutes`
        );

        console.log(
            `Grid emission factor: ${GRID_EMISSION_FACTOR} ${GRID_EMISSION_FACTOR_UNIT}`
        );
    }
);