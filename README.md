
# Urja Mitra

Smart Renewable Energy Utilization & Management System



## What We Built
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
## Key Features
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

### Smart Appliance Management
Stores appliance information such as:
- Power consumption
- Priority
- Flexibility
- Preferred operating window
- Required operating duration
### Renewable-Aware Scheduling
The optimizer evaluates candidate operating windows using:
- Renewable availability
- Appliance energy requirement
- Preferred operating window
- Appliance priority
- Existing schedules
- Estimated grid dependency
### Smart Daily Plan
Generates a daily renewable-aware plan using the latest available energy dataset and the same scheduling logic used by the optimizer.
### Explainable Recommendations
Recommendations can explain the selection using renewable coverage, renewable surplus, appliance priority, grid dependency, and preferred operating-window conditions.
### Energy Alerts & Data Quality
The dashboard displays renewable-energy alerts and checks the consistency of energy readings used for calculations.
### What-If Analysis
The backend can estimate how an additional flexible load could affect renewable utilization, grid dependency, renewable surplus, and estimated CO₂ impact.

## How It Works
        Renewable Energy Data
                 +
           Appliance Data
                 +
          User Constraints
                 |
                 v
      +----------------------+
      |   UrjaMitra Engine   |
      |----------------------|
      | Constraint Checking  |
      | Candidate Slot Eval. |
      | Score Calculation    |
      | Schedule Selection   |
      +----------+-----------+
                 |
                 v
       Recommended Schedule
                 |
                 v
       Impact & Energy Metrics
## Scheduling Logic
| Factor | Weight |
|---|---:|
| Renewable coverage | 60 |
| Grid reduction | 20 |
| Appliance priority | 10 |
| Time preference | 10 |

The optimizer uses 15-minute planning intervals to handle appliances with different operating durations.
## Technology Stack
| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript |
| Backend | Node.js, Express.js |
| Database | MySQL |
| Data Visualization | Chart.js |
| API | REST-style JSON endpoints |
| Scheduling | Rule-based optimization / scoring |
## System Architecture

        +----------------------+ 
        |       Frontend       | 
        |   HTML + CSS + JS    | 
        +----------+-----------+ 
                   |
                   | HTTP / JSON 
                   v 
        +----------------------+ 
        |   Node.js + Express  | 
        |                      | 
        |     Energy APIs      | 
        |     Appliance APIs   | 
        |     Schedule APIs    | 
        |     Optimizer API    | 
        |     Analysis APIs    | 
        +----------+-----------+ 
                   | 
                   v     
        +----------------------+ 
        |        MySQL         | 
        |                      | 
        |   Energy Generation  | 
        |      Appliances      | 
        |      Schedules       | 
        |    Energy Alerts     | 
        +----------------------+     
## Project Structure
    Urja-mitra/
    │
    ├── backend/
    │   ├── server.js        # Express server and application APIs
    │   └── db.js            # MySQL connection pool
    │
    ├── frontend/
    │   ├── css/             # Frontend styles
    │   ├── js/              # Frontend application logic
    │   └── index.html       # Main dashboard interface
    │
    ├── schema_files/        # Supporting database/schema files
    ├── schema.sql           # Database schema and sample data
    ├── package.json         # Project dependencies
    ├── package-lock.json
    └── .gitignore
## Main Application Sections
1. Dashboard – overall energy summary
2. Energy Analysis – generation, consumption, and grid-import trends
3. Smart Appliances – flexible appliance overview
4. Schedules – appliance schedule management
5. Alerts – renewable-energy alerts
6. Smart Optimizer – renewable-aware scheduling recommendations
7. Smart Daily Plan – daily operating guidance
8. Data Quality – energy-data consistency checks
## API Overview
    GET  /api/health
    GET  /api/energy
    GET  /api/appliances
    GET  /api/alerts
    GET  /api/schedules
    POST /api/schedules
    GET  /api/dashboard-summary
    GET  /api/optimizer
    GET  /api/what-if
    GET  /api/daily-plan
    GET  /api/analysis
## Database
The MySQL schema supports energy-management data including:
- appliances
- schedules
- energy_alerts
- Energy-generation readings
Appliance records support power consumption, priority, flexibility, preferred start/end times, and duration. Schedule records include renewable availability, estimated grid usage, optimization score, and recommendation reason.
## Running the Project Locally
### Prerequisites
    - Node.js
    - npm
    - MySQL
    - Git

    1. Clone the repository

    git clone https://github.com/advait-0611/Urja-mitra.git
    cd Urja-mitra

    2. Install dependencies

    npm install

    3. Configure MySQL

    Create a MySQL database named:
    
    urja_mitra

    Configure the connection with environment variables:

    DB_HOST=127.0.0.1
    DB_PORT=3306
    DB_USER=root
    DB_PASSWORD=your_password
    DB_NAME=urja_mitra
    PORT=5000

    4. Initialize the database

    mysql -u root -p urja_mitra < schema.sql

    5. Start the server
    
    node backend/server.js
    
    Then open:
    http://localhost:5000
## Prototype
The current version focuses on software-based monitoring, analysis, and scheduling recommendations.
It does not directly switch or control physical appliances.
The current energy workflow can be extended with live renewable-generation feeds, weather forecasting, smart meters, inverter integration, IoT devices, EV charging, and advanced optimization techniques. 
## Current Prototype Limitations
Energy analysis depends on the available dataset rather than a live household solar installation.
Recommendations are decision-support outputs and do not directly control appliances.
Forecasting and hardware integrations are future extensions.
Impact figures depend on the input dataset and calculation assumptions.
## Future Scope
    Current Prototype
        |
        +--> Live Solar / Smart Meter Data
        |
        +--> Weather & Generation Forecasting
        |
        +--> IoT Appliance Control
        |
        +--> EV Charging Optimization
        |
        +--> Smart Building / Microgrid Integration
## Research & References

### Research Paper 
    1. Home Energy Management in Smart Households: Optimal Appliance Scheduling Model with Photovoltaic Energy Storage System
    https://doi.org/10.1016/j.egyr.2020.09.001

    2. A Real-Time Automated Scheduling Algorithm with PV Integration for Smart Home Prosumers
    https://doi.org/10.1016/j.jobe.2021.102828

    3. Smart Home Demand-Side Management Based on Rooftop Deep Learning Photovoltaic Power Forecasting
    https://doi.org/10.1016/j.suscom.2025.101162
### Implementation References
- HEMS: https://github.com/adrianghc/HEMS
- OpenHEMS: https://github.com/abriotde/openhems-sample
## Smart India Hackathon
    Problem Statement : SIH26200
    Domain : Renewable / Sustainable Energy
    Project : UrjaMitra

    UrjaMitra was developed as a software prototype to explore practical 
    renewable-aware energy management through monitoring, scheduling, and decision support.
## Team
### Built by the team Off by One for Smart India Hackathon 2026.
