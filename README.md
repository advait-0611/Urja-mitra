UrjaMitra
Smart Renewable Energy Utilization & Management System
UrjaMitra is a web-based energy management prototype designed to help households make better use of available renewable energy by monitoring generation and consumption, evaluating flexible appliance loads, and generating renewable-aware scheduling recommendations.
The system combines renewable-energy data, appliance characteristics, operating constraints, and priority to recommend suitable time windows for appliance operation.
Problem Statement
Renewable energy generation, especially solar generation, varies throughout the day. Household appliances, however, are often operated without considering when renewable energy is most available.
This can create a mismatch between:
Renewable Supply ↔ Household Demand
UrjaMitra addresses this mismatch through data-driven monitoring and rule-based scheduling recommendations.
What We Built
The current prototype provides a complete web-based workflow for:
- Monitoring renewable generation, energy consumption, and grid import
- Viewing renewable utilization, renewable share, and grid dependency
- Managing flexible appliance information and operating constraints
- Generating renewable-aware appliance schedules
- Producing a Smart Daily Energy Plan
- Showing explainable reasons behind schedule recommendations
- Estimating renewable coverage and grid-energy reduction
- Displaying energy alerts and data-quality status
- Running what-if analysis for additional flexible loads
The system is designed as a decision-support prototype. It recommends operating periods rather than directly controlling physical appliances.
Key Features
Energy Dashboard
- Total renewable generation
- Total energy consumption
- Grid import
- Estimated CO₂ avoided
- Renewable utilization
- Renewable share
- Grid dependency
- Peak renewable generation window
- Energy generation and consumption trends
Smart Appliance Management
Stores appliance information such as:
- Power consumption
- Priority
- Flexibility
- Preferred operating window
- Required operating duration
Renewable-Aware Scheduling
The optimizer evaluates candidate operating windows using:
- Renewable availability
- Appliance energy requirement
- Preferred operating window
- Appliance priority
- Existing schedules
- Estimated grid dependency
Smart Daily Plan
Generates a daily renewable-aware plan using the latest available energy dataset and the same scheduling logic used by the optimizer.
Explainable Recommendations
Recommendations can explain the selection using renewable coverage, renewable surplus, appliance priority, grid dependency, and preferred operating-window conditions.
Energy Alerts & Data Quality
The dashboard displays renewable-energy alerts and checks the consistency of energy readings used for calculations.
What-If Analysis
The backend can estimate how an additional flexible load could affect renewable utilization, grid dependency, renewable surplus, and estimated CO₂ impact.
