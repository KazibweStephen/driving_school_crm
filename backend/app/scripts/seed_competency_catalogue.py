"""Seed the competency catalogue for all existing companies.

Usage:
    docker compose exec backend python -m app.scripts.seed_competency_catalogue
"""
import asyncio
import uuid

from sqlalchemy import select

from app.core.database import async_session
from app.models.company import Company
from app.models.competency_catalogue import (
    Competency,
    CompetencyCategory,
    CompetencyDifficulty,
    CompetencyPrerequisite,
    CompetencyTrainingCategory,
    CompetencyVersion,
    CompetencyVersionStatus,
)

# ── Seed Data ──

CATEGORIES = [
    {"name": "Vehicle Familiarisation", "description": "Familiarisation with vehicle cockpit, controls, and safety checks", "display_order": 1},
    {"name": "Vehicle Operation", "description": "Core vehicle operation skills including starting, stopping, and positioning", "display_order": 2},
    {"name": "Manual Transmission", "description": "Manual gearbox operation, clutch control, and gear changes", "display_order": 3},
    {"name": "Automatic Transmission", "description": "Automatic gearbox operation, selector positions, and smooth driving", "display_order": 4},
    {"name": "Steering & Control", "description": "Steering techniques, speed control, and vehicle stability", "display_order": 5},
    {"name": "Junctions", "description": "Junction types, turning, and priority rules", "display_order": 6},
    {"name": "Roundabouts", "description": "Roundabout navigation, lane selection, and signalling", "display_order": 7},
    {"name": "Parking & Reversing", "description": "Reversing manoeuvres, parking techniques, and low-speed control", "display_order": 8},
    {"name": "Traffic Management", "description": "Traffic signals, crossings, and interaction with other road users", "display_order": 9},
    {"name": "Road Types", "description": "Driving on different road types and speed management", "display_order": 10},
    {"name": "Defensive Driving", "description": "Hazard perception, emergency manoeuvres, and risk management", "display_order": 11},
    {"name": "Test Readiness", "description": "Independent driving, mock tests, and examination preparation", "display_order": 12},
    {"name": "Motorcycle", "description": "Motorcycle-specific controls, balance, and riding techniques", "display_order": 13},
]

COMPETENCIES = [
    # Vehicle Familiarisation (VF)
    {"code": "VF001", "name": "Cockpit Drill (DSSSM)", "category": "Vehicle Familiarisation", "difficulty": "beginner", "description": "Performs the complete cockpit drill correctly before driving.", "learning_outcome": "Student correctly performs the cockpit drill independently before every drive.", "assessment_criteria": ["Seat adjusted correctly", "Mirrors adjusted correctly", "Seat belt fastened", "Vehicle controls identified", "Instructor intervention not required"], "display_order": 1},
    {"code": "VF002", "name": "Seat Adjustment", "category": "Vehicle Familiarisation", "difficulty": "beginner", "description": "Adjusts seat for safe driving posture.", "learning_outcome": "Student adjusts seat to achieve safe and comfortable driving position.", "assessment_criteria": ["Seat distance adjusted for pedal reach", "Seat back angle adjusted for steering access", "Head restraint positioned correctly", "Instructor intervention not required"], "display_order": 2},
    {"code": "VF003", "name": "Steering Wheel Adjustment", "category": "Vehicle Familiarisation", "difficulty": "beginner", "description": "Positions steering wheel correctly.", "learning_outcome": "Student positions steering wheel for optimal control.", "assessment_criteria": ["Steering wheel height adjusted", "Steering wheel reach adjusted", "Clear view of instruments", "Hands at correct position"], "display_order": 3},
    {"code": "VF004", "name": "Mirror Adjustment", "category": "Vehicle Familiarisation", "difficulty": "beginner", "description": "Adjusts all mirrors correctly.", "learning_outcome": "Student adjusts all mirrors for maximum rear visibility.", "assessment_criteria": ["Interior mirror adjusted", "Left door mirror adjusted", "Right door mirror adjusted", "Minimal blind spots", "Instructor intervention not required"], "display_order": 4},
    {"code": "VF005", "name": "Seat Belt Use", "category": "Vehicle Familiarisation", "difficulty": "beginner", "description": "Correctly fastens and checks seat belt.", "learning_outcome": "Student correctly fastens seat belt before every journey.", "assessment_criteria": ["Seat belt pulled smoothly", "Belt fastened securely", "Belt sits across chest and pelvis", "No twists in belt"], "display_order": 5},
    {"code": "VF006", "name": "Vehicle Controls Identification", "category": "Vehicle Familiarisation", "difficulty": "beginner", "description": "Identifies pedals, switches and dashboard controls.", "learning_outcome": "Student identifies all major vehicle controls without prompting.", "assessment_criteria": ["Accelerator identified", "Brake identified", "Clutch identified (manual)", "Indicator stalk identified", "Wiper controls identified", "Light controls identified"], "display_order": 6},
    {"code": "VF007", "name": "Dashboard Warning Lights", "category": "Vehicle Familiarisation", "difficulty": "beginner", "description": "Explains common dashboard warning indicators.", "learning_outcome": "Student explains the meaning of common dashboard warning lights.", "assessment_criteria": ["Engine management light explained", "Oil pressure warning explained", "Battery warning explained", "Temperature warning explained", "Brake system warning explained"], "display_order": 7},
    {"code": "VF008", "name": "Vehicle Safety Checks", "category": "Vehicle Familiarisation", "difficulty": "beginner", "description": "Performs daily pre-drive safety inspection.", "learning_outcome": "Student performs pre-drive safety checks independently.", "assessment_criteria": ["Tyres checked for condition and pressure", "Lights checked and working", "Oil level checked", "Coolant level checked", "All checks completed in logical order"], "display_order": 8},

    # Vehicle Operation (VO)
    {"code": "VO001", "name": "Engine Start Procedure", "category": "Vehicle Operation", "difficulty": "beginner", "description": "Starts vehicle safely.", "learning_outcome": "Student starts the engine using the correct procedure.", "assessment_criteria": ["Checks gear selector is in neutral/park", "Depresses clutch (manual)", "Turns key/pushes start button smoothly", "No stalling on start", "Instructor intervention not required"], "display_order": 1},
    {"code": "VO002", "name": "Engine Shutdown", "category": "Vehicle Operation", "difficulty": "beginner", "description": "Parks and shuts down correctly.", "learning_outcome": "Student shuts down engine safely and secures vehicle.", "assessment_criteria": ["Vehicle brought to safe stop", "Handbrake applied", "Selector in neutral/park", "Engine switched off", "Seat belt removed after shutdown"], "display_order": 2},
    {"code": "VO003", "name": "Parking Brake Operation", "category": "Vehicle Operation", "difficulty": "beginner", "description": "Correctly applies and releases parking brake.", "learning_outcome": "Student applies and releases parking brake correctly.", "assessment_criteria": ["Applied firmly before moving off", "Released smoothly when moving", "Applied when parking", "No rolling on hills"], "display_order": 3},
    {"code": "VO004", "name": "POM Routine", "category": "Vehicle Operation", "difficulty": "beginner", "description": "Uses Prepare, Observe, Move routine consistently.", "learning_outcome": "Student consistently applies the POM routine before moving off.", "assessment_criteria": ["Prepare: gear and gas set", "Observe: full mirror and blind spot check", "Move: signal if needed and move off smoothly", "Routine applied without prompting"], "display_order": 4},
    {"code": "VO005", "name": "Observation Before Moving", "category": "Vehicle Operation", "difficulty": "beginner", "description": "Performs effective 360° observations.", "learning_outcome": "Student performs comprehensive observations before moving.", "assessment_criteria": ["Checks all mirrors", "Checks left blind spot", "Checks right blind spot", "Checks ahead", "Checks rear", "Observations are systematic and thorough"], "display_order": 5},
    {"code": "VO006", "name": "Controlled Moving Off", "category": "Vehicle Operation", "difficulty": "beginner", "description": "Moves away smoothly and safely.", "learning_outcome": "Student moves off smoothly and safely from any position.", "assessment_criteria": ["Smooth clutch control (manual)", "No stalling", "No rolling back", "Correct road position on moving off", "Appropriate speed"], "display_order": 6},
    {"code": "VO007", "name": "Controlled Stopping", "category": "Vehicle Operation", "difficulty": "beginner", "description": "Stops smoothly and accurately.", "learning_outcome": "Student stops the vehicle smoothly at the intended point.", "assessment_criteria": ["Braking progressive and smooth", "Accurate stopping position", "Vehicle parallel to kerb", "Appropriate distance from hazards", "Hands on wheel during braking"], "display_order": 7},
    {"code": "VO008", "name": "Vehicle Positioning", "category": "Vehicle Operation", "difficulty": "intermediate", "description": "Maintains correct road position.", "learning_outcome": "Student maintains correct road position in various conditions.", "assessment_criteria": ["Positioned correctly for direction of travel", "Appropriate distance from kerb", "Central in lane unless turning", "Adjusts position for road conditions", "No drifting"], "display_order": 8},

    # Manual Transmission (MT)
    {"code": "MT001", "name": "Clutch Bite Point", "category": "Manual Transmission", "difficulty": "beginner", "description": "Finds and controls clutch bite point.", "learning_outcome": "Student finds clutch bite point reliably.", "assessment_criteria": ["Identifies bite point consistently", "Holds at bite without stalling", "Smooth transition from bite to movement", "No excessive revving"], "display_order": 1},
    {"code": "MT002", "name": "Clutch Control", "category": "Manual Transmission", "difficulty": "beginner", "description": "Maintains smooth clutch control.", "learning_outcome": "Student demonstrates smooth clutch operation throughout driving.", "assessment_criteria": ["Progressive clutch release", "No stalling during gear changes", "Smooth low-speed control", "Clutch fully released when cruising"], "display_order": 2},
    {"code": "MT003", "name": "First Gear Selection", "category": "Manual Transmission", "difficulty": "beginner", "description": "Selects first gear correctly.", "learning_outcome": "Student selects first gear correctly when moving off.", "assessment_criteria": ["Gear selected before moving", "Full gear engagement", "No grinding or crunching", "Clutch depressed before selection"], "display_order": 3},
    {"code": "MT004", "name": "Second Gear Changes", "category": "Manual Transmission", "difficulty": "beginner", "description": "Changes between first and second gears smoothly.", "learning_outcome": "Student changes between first and second gears smoothly.", "assessment_criteria": ["Clutch depressed fully", "Gear changed without grinding", "Acceleration smooth during change", "Appropriate timing for change"], "display_order": 4},
    {"code": "MT005", "name": "Third/Fourth Gear Changes", "category": "Manual Transmission", "difficulty": "intermediate", "description": "Selects higher gears correctly.", "learning_outcome": "Student selects higher gears at appropriate times.", "assessment_criteria": ["Gear changes at appropriate speed", "Smooth engagement", "No unnecessary gear changes", "Engine speed matched to gear"], "display_order": 5},
    {"code": "MT006", "name": "Downshifting", "category": "Manual Transmission", "difficulty": "intermediate", "description": "Downshifts without loss of control.", "learning_outcome": "Student downshifts smoothly when slowing down.", "assessment_criteria": ["Braking before downshift", "Clutch used correctly", "Engine braking utilised", "No sudden deceleration"], "display_order": 6},
    {"code": "MT007", "name": "Gear Selection", "category": "Manual Transmission", "difficulty": "intermediate", "description": "Chooses appropriate gear for conditions.", "learning_outcome": "Student selects appropriate gear for speed and conditions.", "assessment_criteria": ["Correct gear for urban driving", "Correct gear for rural roads", "Correct gear for hills", "Avoids coasting in wrong gear"], "display_order": 7},
    {"code": "MT008", "name": "Hill Start (Manual)", "category": "Manual Transmission", "difficulty": "intermediate", "description": "Performs uphill start without rollback.", "learning_outcome": "Student performs hill starts without rolling back.", "assessment_criteria": ["Brake held while finding bite", "Smooth transition to move", "No rollback", "Appropriate power applied"], "display_order": 8},
    {"code": "MT009", "name": "Engine Stall Recovery", "category": "Manual Transmission", "difficulty": "beginner", "description": "Recovers safely after a stall.", "learning_outcome": "Student recovers calmly and safely after stalling.", "assessment_criteria": ["Brake applied immediately", "Gear to neutral", "Restart procedure followed", "Safe to move off again", "No panic"], "display_order": 9},
    {"code": "MT010", "name": "Clutch-Brake Coordination", "category": "Manual Transmission", "difficulty": "intermediate", "description": "Coordinates pedals smoothly.", "learning_outcome": "Student coordinates clutch and brake pedals effectively.", "assessment_criteria": ["Braking with clutch depressed when stopping", "Clutch released progressively when moving", "No unnecessary clutch use while driving", "Smooth pedal transitions"], "display_order": 10},

    # Automatic Transmission (AT)
    {"code": "AT001", "name": "Selector Positions", "category": "Automatic Transmission", "difficulty": "beginner", "description": "Uses P, R, N, D correctly.", "learning_outcome": "Student uses all selector positions correctly.", "assessment_criteria": ["P used when parked", "R used only when reversing", "N used at traffic lights (if appropriate)", "D used for forward driving", "Selector changed with foot on brake"], "display_order": 1},
    {"code": "AT002", "name": "Brake Control", "category": "Automatic Transmission", "difficulty": "beginner", "description": "Controls braking smoothly.", "learning_outcome": "Student applies brakes smoothly and progressively.", "assessment_criteria": ["Progressive braking applied", "No sudden stops (unless emergency)", "Accurate stopping position", "Brake held on hills"], "display_order": 2},
    {"code": "AT003", "name": "Creep Control", "category": "Automatic Transmission", "difficulty": "beginner", "description": "Uses vehicle creep effectively.", "learning_outcome": "Student uses creep for low-speed manoeuvres.", "assessment_criteria": ["Controls speed with brake only", "Smooth at junctions", "Appropriate for parking manoeuvres", "No unnecessary acceleration"], "display_order": 3},
    {"code": "AT004", "name": "Hill Hold", "category": "Automatic Transmission", "difficulty": "beginner", "description": "Performs hill starts using automatic vehicle.", "learning_outcome": "Student performs hill starts without rollback in automatic.", "assessment_criteria": ["Brake held on incline", "Smooth transition to drive", "No rollback", "Appropriate acceleration"], "display_order": 4},
    {"code": "AT005", "name": "Transmission Modes", "category": "Automatic Transmission", "difficulty": "intermediate", "description": "Uses drive modes appropriately.", "learning_outcome": "Student uses different drive modes when appropriate.", "assessment_criteria": ["D used for normal driving", "S/L used when additional control needed", "Mode selection appropriate for conditions", "No inappropriate mode use"], "display_order": 5},
    {"code": "AT006", "name": "Smooth Acceleration", "category": "Automatic Transmission", "difficulty": "beginner", "description": "Accelerates progressively.", "learning_outcome": "Student accelerates smoothly in automatic.", "assessment_criteria": ["Progressive acceleration", "No sudden surges", "Appropriate speed reached", "Passenger comfort maintained"], "display_order": 6},
    {"code": "AT007", "name": "Eco Driving", "category": "Automatic Transmission", "difficulty": "intermediate", "description": "Uses economical driving techniques.", "learning_outcome": "Student demonstrates fuel-efficient driving habits.", "assessment_criteria": ["Smooth acceleration", "Anticipates traffic flow", "Maintains steady speed", "Avoids unnecessary braking"], "display_order": 7},
    {"code": "AT008", "name": "Automatic Parking", "category": "Automatic Transmission", "difficulty": "intermediate", "description": "Controls automatic vehicle during parking.", "learning_outcome": "Student parks automatic vehicle safely.", "assessment_criteria": ["Appropriate use of P mode", "Brake held during manoeuvre", "Accurate positioning", "Vehicle secured correctly"], "display_order": 8},

    # Steering & Control (SC)
    {"code": "SC001", "name": "Push-Pull Steering", "category": "Steering & Control", "difficulty": "beginner", "description": "Demonstrates push-pull steering.", "learning_outcome": "Student uses push-pull steering technique correctly.", "assessment_criteria": ["Hands in correct position", "Smooth steering input", "Hands do not cross", "Vehicle controlled throughout"], "display_order": 1},
    {"code": "SC002", "name": "Steering Accuracy", "category": "Steering & Control", "difficulty": "intermediate", "description": "Maintains steering precision.", "learning_outcome": "Student steers accurately through various manoeuvres.", "assessment_criteria": ["Accurate lane positioning", "Smooth steering corrections", "No oversteering", "Precise positioning at junctions"], "display_order": 2},
    {"code": "SC003", "name": "Lane Discipline", "category": "Steering & Control", "difficulty": "intermediate", "description": "Maintains lane position.", "learning_outcome": "Student maintains correct lane discipline.", "assessment_criteria": ["Correct lane for direction", "Lane changes with mirrors and signal", "No drifting between lanes", "Appropriate lane at roundabouts"], "display_order": 3},
    {"code": "SC004", "name": "Speed Control", "category": "Steering & Control", "difficulty": "intermediate", "description": "Selects safe speeds.", "learning_outcome": "Student selects appropriate speed for conditions.", "assessment_criteria": ["Speed within limits", "Reduced speed near hazards", "Appropriate approach speed to junctions", "Speed adjusted for weather and traffic"], "display_order": 4},
    {"code": "SC005", "name": "Following Distance", "category": "Steering & Control", "difficulty": "intermediate", "description": "Maintains safe following distance.", "learning_outcome": "Student maintains appropriate following distance.", "assessment_criteria": ["2-second rule applied in dry conditions", "Increased distance in wet/dark", "Gap maintained consistently", "Adjusted for traffic conditions"], "display_order": 5},
    {"code": "SC006", "name": "Cornering", "category": "Steering & Control", "difficulty": "intermediate", "description": "Negotiates bends safely.", "learning_outcome": "Student negotiates bends safely and smoothly.", "assessment_criteria": ["Appropriate approach speed", "Braking before bend", "Steering smooth and accurate", "Accelerating out of bend"], "display_order": 6},
    {"code": "SC007", "name": "Hazard Response", "category": "Steering & Control", "difficulty": "intermediate", "description": "Responds appropriately to hazards.", "learning_outcome": "Student responds to hazards safely and promptly.", "assessment_criteria": ["Hazard identified early", "Speed reduced", "Appropriate action taken", "Surroundings checked before action"], "display_order": 7},
    {"code": "SC008", "name": "Vehicle Stability", "category": "Steering & Control", "difficulty": "advanced", "description": "Maintains stable vehicle control.", "learning_outcome": "Student maintains vehicle stability in all conditions.", "assessment_criteria": ["Smooth inputs throughout", "Vehicle balanced on corners", "Control maintained in wind", "Stable at all speeds"], "display_order": 8},

    # Junctions (JN)
    {"code": "JN001", "name": "MSM Routine", "category": "Junctions", "difficulty": "beginner", "description": "Uses Mirror-Signal-Manoeuvre correctly.", "learning_outcome": "Student applies MSM routine consistently at junctions.", "assessment_criteria": ["Mirror check before signal", "Signal applied at correct time", "Manoeuvre executed safely", "Routine applied without prompting"], "display_order": 1},
    {"code": "JN002", "name": "Left Turns", "category": "Junctions", "difficulty": "beginner", "description": "Executes safe left turns.", "learning_outcome": "Student turns left safely and accurately.", "assessment_criteria": ["Correct road position on approach", "Appropriate signal", "Speed reduced", "Kerbside positioning maintained", "Observations completed"], "display_order": 2},
    {"code": "JN003", "name": "Right Turns", "category": "Junctions", "difficulty": "intermediate", "description": "Executes safe right turns.", "learning_outcome": "Student turns right safely.", "assessment_criteria": ["Correct position on approach", "Signal applied", "Gap judgement correct", "Turning position accurate", "Observations completed"], "display_order": 3},
    {"code": "JN004", "name": "Crossroads", "category": "Junctions", "difficulty": "intermediate", "description": "Negotiates crossroads correctly.", "learning_outcome": "Student negotiates crossroads safely.", "assessment_criteria": ["Priority rules understood", "Appropriate speed", "Observations in all directions", "Clear path confirmed before proceeding"], "display_order": 4},
    {"code": "JN005", "name": "T-Junctions", "category": "Junctions", "difficulty": "beginner", "description": "Applies priority rules correctly.", "learning_outcome": "Student correctly applies priority at T-junctions.", "assessment_criteria": ["Approach speed appropriate", "Give way or priority correctly applied", "Observations completed", "Safe entry onto road"], "display_order": 5},
    {"code": "JN006", "name": "Give Way Rules", "category": "Junctions", "difficulty": "beginner", "description": "Gives priority appropriately.", "learning_outcome": "Student correctly yields priority where required.", "assessment_criteria": ["Identifies give way markings", "Stops or slows as required", "Proceeds only when safe", "Does not obstruct other traffic"], "display_order": 6},
    {"code": "JN007", "name": "Gap Judgement", "category": "Junctions", "difficulty": "intermediate", "description": "Selects safe traffic gaps.", "learning_outcome": "Student judges safe gaps in traffic.", "assessment_criteria": ["Correctly assesses gap size", "Accelerates appropriately to join", "Does not force other vehicles to brake", "Decision made decisively"], "display_order": 7},
    {"code": "JN008", "name": "Traffic Observation", "category": "Junctions", "difficulty": "intermediate", "description": "Observes effectively at junctions.", "learning_outcome": "Student observes thoroughly at all junctions.", "assessment_criteria": ["Looks in all directions", "Checks mirrors on approach", "Scans for pedestrians and cyclists", "Observations are systematic"], "display_order": 8},

    # Roundabouts (RB)
    {"code": "RB001", "name": "Mini Roundabouts", "category": "Roundabouts", "difficulty": "beginner", "description": "Drives through mini-roundabouts safely.", "learning_outcome": "Student navigates mini-roundabouts safely.", "assessment_criteria": ["Appropriate approach speed", "Priority rules applied", "Steering appropriate", "Signal used when exiting"], "display_order": 1},
    {"code": "RB002", "name": "Multi-Lane Roundabouts", "category": "Roundabouts", "difficulty": "intermediate", "description": "Negotiates larger roundabouts.", "learning_outcome": "Student navigates multi-lane roundabouts safely.", "assessment_criteria": ["Correct lane selected", "Entry speed appropriate", "Path through roundabout maintained", "Exit signalled correctly"], "display_order": 2},
    {"code": "RB003", "name": "Lane Selection", "category": "Roundabouts", "difficulty": "intermediate", "description": "Selects correct lane.", "learning_outcome": "Student selects appropriate lane for exit.", "assessment_criteria": ["Left lane for left/near exits", "Right lane for right/far exits", "Lane changes only where permitted", "Mirror checks before lane change"], "display_order": 3},
    {"code": "RB004", "name": "Exit Signalling", "category": "Roundabouts", "difficulty": "intermediate", "description": "Signals correctly when exiting.", "learning_outcome": "Student signals at the correct point when exiting.", "assessment_criteria": ["Signal left after passing the exit before", "Signal timed correctly", "Mirror checks before exit", "Exit executed smoothly"], "display_order": 4},
    {"code": "RB005", "name": "Roundabout Priority", "category": "Roundabouts", "difficulty": "beginner", "description": "Applies give-way rules.", "learning_outcome": "Student correctly applies give-way rules at roundabouts.", "assessment_criteria": ["Gives way to traffic from the right", "Enters when safe", "Does not cause other traffic to slow", "Maintains appropriate speed"], "display_order": 5},
    {"code": "RB006", "name": "Spiral Roundabouts", "category": "Roundabouts", "difficulty": "advanced", "description": "Navigates spiral layouts safely.", "learning_outcome": "Student navigates spiral roundabouts correctly.", "assessment_criteria": ["Lane discipline maintained", "Correct lane for exit", "No sudden lane changes", "Signals appropriate"], "display_order": 6},

    # Parking & Reversing (PK)
    {"code": "PK001", "name": "Straight Reverse", "category": "Parking & Reversing", "difficulty": "beginner", "description": "Reverses in a straight line.", "learning_outcome": "Student reverses in a straight line accurately.", "assessment_criteria": ["Full rear observation", "Steering maintained straight", "Controlled speed", "Accurate positioning"], "display_order": 1},
    {"code": "PK002", "name": "Left Reverse", "category": "Parking & Reversing", "difficulty": "intermediate", "description": "Performs left reverse.", "learning_outcome": "Student reverses safely to the left.", "assessment_criteria": ["Observations all around", "Steering controlled", "Speed maintained low", "Accurate positioning"], "display_order": 2},
    {"code": "PK003", "name": "Right Reverse", "category": "Parking & Reversing", "difficulty": "intermediate", "description": "Performs right reverse.", "learning_outcome": "Student reverses safely to the right.", "assessment_criteria": ["Full observations", "Steering controlled", "Speed maintained low", "Vehicle positioned correctly"], "display_order": 3},
    {"code": "PK004", "name": "Reverse Bay Parking", "category": "Parking & Reversing", "difficulty": "intermediate", "description": "Parks in reverse into a bay.", "learning_outcome": "Student parks in a bay using reverse.", "assessment_criteria": ["Positioning appropriate", "Observations throughout", "Steering timed correctly", "Vehicle centred in bay"], "display_order": 4},
    {"code": "PK005", "name": "Forward Bay Parking", "category": "Parking & Reversing", "difficulty": "intermediate", "description": "Parks forward into a bay.", "learning_outcome": "Student parks forward into a bay.", "assessment_criteria": ["Approach angle appropriate", "Steering timed correctly", "Vehicle centred in bay", "Observations completed"], "display_order": 5},
    {"code": "PK006", "name": "Parallel Parking", "category": "Parking & Reversing", "difficulty": "advanced", "description": "Parallel parks safely.", "learning_outcome": "Student parallel parks accurately.", "assessment_criteria": ["Starting position appropriate", "Observations throughout", "Steering and reversing coordinated", "Vehicle parallel to kerb", "Reasonable distance from vehicle ahead"], "display_order": 6},
    {"code": "PK007", "name": "Three Point Turn", "category": "Parking & Reversing", "difficulty": "intermediate", "description": "Completes three-point turn.", "learning_outcome": "Student completes a three-point turn safely.", "assessment_criteria": ["Observations before each move", "Steering applied at appropriate points", "Vehicle turned within road width", "Safe to proceed after turn"], "display_order": 7},
    {"code": "PK008", "name": "U-Turn", "category": "Parking & Reversing", "difficulty": "intermediate", "description": "Performs U-turn safely.", "learning_outcome": "Student performs U-turn safely where permitted.", "assessment_criteria": ["Checks road is clear", "Signal applied", "Steering full lock", "Completed in one manoeuvre", "Safe road position after"], "display_order": 8},

    # Traffic Management (TM)
    {"code": "TM001", "name": "Traffic Lights", "category": "Traffic Management", "difficulty": "beginner", "description": "Responds correctly to signals.", "learning_outcome": "Student responds to all traffic light phases correctly.", "assessment_criteria": ["Stops at red", "Proceeds on green", "Responds to amber appropriately", "Waits at red arrow", "Checks before proceeding on green"], "display_order": 1},
    {"code": "TM002", "name": "Zebra Crossings", "category": "Traffic Management", "difficulty": "beginner", "description": "Gives priority to pedestrians.", "learning_outcome": "Student gives way to pedestrians at zebra crossings.", "assessment_criteria": ["Identifies crossing on approach", "Slows and prepares to stop", "Gives way to pedestrians on crossing", "Checks both sides before proceeding"], "display_order": 2},
    {"code": "TM003", "name": "Pedestrian Awareness", "category": "Traffic Management", "difficulty": "beginner", "description": "Identifies pedestrian risks.", "learning_outcome": "Student demonstrates awareness of pedestrian hazards.", "assessment_criteria": ["Scans for pedestrians near road", "Reduces speed near pedestrian areas", "Readies to stop if pedestrians present", "Aware of pedestrians at junctions"], "display_order": 3},
    {"code": "TM004", "name": "Cyclist Awareness", "category": "Traffic Management", "difficulty": "intermediate", "description": "Shares road safely with cyclists.", "learning_outcome": "Student shares road space safely with cyclists.", "assessment_criteria": ["Maintains safe passing distance", "Checks mirrors before overtaking", "Does not squeeze cyclists", "Patient behind cyclists"], "display_order": 4},
    {"code": "TM005", "name": "Bus Stops", "category": "Traffic Management", "difficulty": "intermediate", "description": "Passes bus stops safely.", "learning_outcome": "Student passes bus stops safely.", "assessment_criteria": ["Identifies bus stop on approach", "Checks for passengers", "Gives adequate clearance", "Prepared to stop"], "display_order": 5},
    {"code": "TM006", "name": "School Zones", "category": "Traffic Management", "difficulty": "intermediate", "description": "Adjusts driving near schools.", "learning_outcome": "Student adjusts driving in school zones.", "assessment_criteria": ["Speed reduced", "Extra awareness of children", "Prepared to stop", "Observations increased"], "display_order": 6},
    {"code": "TM007", "name": "Overtaking", "category": "Traffic Management", "difficulty": "advanced", "description": "Overtakes safely.", "learning_outcome": "Student overtakes other vehicles safely.", "assessment_criteria": ["Mirrors and signal used", "Gap is sufficient", "Speed appropriate", "Returns to lane safely", "Does not cause hazard"], "display_order": 7},
    {"code": "TM008", "name": "Lane Changing", "category": "Traffic Management", "difficulty": "intermediate", "description": "Changes lanes safely.", "learning_outcome": "Student changes lanes safely.", "assessment_criteria": ["Mirrors checked", "Signal applied", "Gap confirmed", "Change executed smoothly", "No sudden movements"], "display_order": 8},

    # Road Types (RT)
    {"code": "RT001", "name": "Residential Roads", "category": "Road Types", "difficulty": "beginner", "description": "Drives safely in residential areas.", "learning_outcome": "Student drives cautiously in residential areas.", "assessment_criteria": ["Appropriate speed for area", "Aware of children and pets", "Prepared for parked vehicles", "Observant at driveways"], "display_order": 1},
    {"code": "RT002", "name": "Urban Roads", "category": "Road Types", "difficulty": "intermediate", "description": "Handles city traffic confidently.", "learning_outcome": "Student navigates urban roads confidently.", "assessment_criteria": ["Manages busy traffic", "Lane discipline maintained", "Appropriate speed", "Deals with intersections"], "display_order": 2},
    {"code": "RT003", "name": "Rural Roads", "category": "Road Types", "difficulty": "intermediate", "description": "Drives safely on rural roads.", "learning_outcome": "Student drives safely on country roads.", "assessment_criteria": ["Speed appropriate for narrow roads", "Prepared for farm vehicles", "Handles bends safely", "Aware of animals"], "display_order": 3},
    {"code": "RT004", "name": "High-Speed Roads", "category": "Road Types", "difficulty": "intermediate", "description": "Controls vehicle at higher speeds.", "learning_outcome": "Student maintains control at higher speeds.", "assessment_criteria": ["Speed limit observed", "Following distance maintained", "Lane discipline good", "Overtaking safe"], "display_order": 4},
    {"code": "RT005", "name": "Dual Carriageways", "category": "Road Types", "difficulty": "intermediate", "description": "Joins and exits safely.", "learning_outcome": "Student joins and exits dual carriageways safely.", "assessment_criteria": ["Acceleration on slip road", "Gap selected safely", "Appropriate lane on joining", "Exit signalled and executed"], "display_order": 5},
    {"code": "RT006", "name": "Expressways", "category": "Road Types", "difficulty": "advanced", "description": "Maintains lane discipline and speed.", "learning_outcome": "Student drives confidently on expressways.", "assessment_criteria": ["Speed maintained appropriately", "Lane discipline excellent", "Overtaking performed safely", "Exit planning adequate"], "display_order": 6},
    {"code": "RT007", "name": "Gravel Roads", "category": "Road Types", "difficulty": "advanced", "description": "Adapts driving to loose surfaces.", "learning_outcome": "Student adapts driving for loose road surfaces.", "assessment_criteria": ["Speed reduced", "Steering smooth", "Braking gentle", "Aware of reduced grip"], "display_order": 7},
    {"code": "RT008", "name": "Mountain Roads", "category": "Road Types", "difficulty": "advanced", "description": "Handles gradients and bends safely.", "learning_outcome": "Student drives safely on mountain roads.", "assessment_criteria": ["Appropriate gear for gradient", "Speed controlled on descents", "Bends negotiated safely", "Overtaking points used correctly"], "display_order": 8},

    # Defensive Driving (DD)
    {"code": "DD001", "name": "Hazard Perception", "category": "Defensive Driving", "difficulty": "intermediate", "description": "Identifies hazards early.", "learning_outcome": "Student identifies potential hazards before they develop.", "assessment_criteria": ["Scans road ahead continuously", "Identifies developing hazards", "Takes early action", "Aware of road margins"], "display_order": 1},
    {"code": "DD002", "name": "Defensive Positioning", "category": "Defensive Driving", "difficulty": "intermediate", "description": "Maintains escape routes.", "learning_outcome": "Student positions vehicle to maintain escape routes.", "assessment_criteria": ["Avoids blind spots of others", "Maintains space around vehicle", "Positions for visibility", "Uses road position defensively"], "display_order": 2},
    {"code": "DD003", "name": "Space Management", "category": "Defensive Driving", "difficulty": "intermediate", "description": "Maintains safe space around vehicle.", "learning_outcome": "Student maintains safe space cushion.", "assessment_criteria": ["Following distance appropriate", "Side clearance maintained", "Space ahead monitored", "Gap adjusted for conditions"], "display_order": 3},
    {"code": "DD004", "name": "Emergency Braking", "category": "Defensive Driving", "difficulty": "advanced", "description": "Performs controlled emergency stop.", "learning_outcome": "Student performs emergency stop when required.", "assessment_criteria": ["Brakes applied firmly and immediately", "Steering maintained", "Vehicle stopped in shortest distance", "Both hands on wheel"], "display_order": 4},
    {"code": "DD005", "name": "Skid Awareness", "category": "Defensive Driving", "difficulty": "advanced", "description": "Responds appropriately to skids.", "learning_outcome": "Student recognises and responds to skidding.", "assessment_criteria": ["Understands causes of skids", "Responds correctly to skid", "Does not over-correct", "Takes preventive measures"], "display_order": 5},
    {"code": "DD006", "name": "Hydroplaning Awareness", "category": "Defensive Driving", "difficulty": "advanced", "description": "Explains and responds to hydroplaning risks.", "learning_outcome": "Student understands and responds to hydroplaning.", "assessment_criteria": ["Understands causes", "Reduces speed in heavy rain", "Avoids standing water where possible", "Responds correctly if hydroplaning"], "display_order": 6},
    {"code": "DD007", "name": "Fatigue Management", "category": "Defensive Driving", "difficulty": "intermediate", "description": "Recognises fatigue and takes action.", "learning_outcome": "Student recognises fatigue symptoms and takes action.", "assessment_criteria": ["Aware of fatigue signs", "Takes regular breaks", "Plans long journeys", "Does not drive when tired"], "display_order": 7},
    {"code": "DD008", "name": "Distraction Management", "category": "Defensive Driving", "difficulty": "intermediate", "description": "Avoids distracted driving.", "learning_outcome": "Student maintains focus while driving.", "assessment_criteria": ["Mobile not used while driving", "Passengers do not cause distraction", "Focus maintained on road", "Music/volume does not impair awareness"], "display_order": 8},

    # Test Readiness (TR)
    {"code": "TR001", "name": "Independent Driving", "category": "Test Readiness", "difficulty": "advanced", "description": "Drives without instructor prompts.", "learning_outcome": "Student drives independently without instructor input.", "assessment_criteria": ["Follows road signs or directions", "Makes own decisions", "Maintains safe driving", "No prompts needed"], "display_order": 1},
    {"code": "TR002", "name": "Route Planning", "category": "Test Readiness", "difficulty": "intermediate", "description": "Follows directions correctly.", "learning_outcome": "Student follows route directions accurately.", "assessment_criteria": ["Follows sat-nav or verbal directions", "Takes correct turns", "Does not miss turning", "Recovers from wrong turns safely"], "display_order": 2},
    {"code": "TR003", "name": "Mock Test Performance", "category": "Test Readiness", "difficulty": "advanced", "description": "Demonstrates test-standard driving.", "learning_outcome": "Student demonstrates consistent test-standard driving.", "assessment_criteria": ["Drives for 40 minutes independently", "No serious faults", "Minimal minor faults", "Confident and safe throughout"], "display_order": 3},
    {"code": "TR004", "name": "Examiner Instructions", "category": "Test Readiness", "difficulty": "intermediate", "description": "Responds correctly to examiner instructions.", "learning_outcome": "Student follows examiner instructions promptly.", "assessment_criteria": ["Understands verbal directions", "Responds promptly", "Does not panic", "Maintains safe driving while following"], "display_order": 4},
    {"code": "TR005", "name": "Vehicle Checks", "category": "Test Readiness", "difficulty": "intermediate", "description": "Performs 'show me/tell me' style checks.", "learning_outcome": "Student answers vehicle check questions correctly.", "assessment_criteria": ["Tell me questions answered correctly", "Show me questions demonstrated safely", "Knows fluid check locations", "Knows light operation"], "display_order": 5},
    {"code": "TR006", "name": "Test Day Readiness", "category": "Test Readiness", "difficulty": "advanced", "description": "Demonstrates confidence and readiness for assessment.", "learning_outcome": "Student demonstrates readiness for driving test.", "assessment_criteria": ["Confident but not overconfident", "Calm under pressure", "Manages test nerves", "Demonstrates safe driving habits"], "display_order": 6},
    {"code": "TR007", "name": "Consistent Safe Driving", "category": "Test Readiness", "difficulty": "advanced", "description": "Maintains safe driving throughout a full lesson.", "learning_outcome": "Student maintains safe driving consistently.", "assessment_criteria": ["No dangerous faults over full lesson", "Consistently safe observations", "Maintained awareness throughout", "Instructor rarely needs to intervene"], "display_order": 7},
    {"code": "TR008", "name": "Final Competency Assessment", "category": "Test Readiness", "difficulty": "advanced", "description": "Meets all required competencies for course completion.", "learning_outcome": "Student meets all competencies required for test readiness.", "assessment_criteria": ["All VF competencies achieved", "All VO competencies achieved", "Core SC and JN competencies achieved", "Independent driving demonstrated", "Safe driving sustained throughout"], "display_order": 8},

    # Motorcycle (MC)
    {"code": "MC001", "name": "Protective Gear Inspection", "category": "Motorcycle", "difficulty": "beginner", "description": "Selects and wears correct protective gear.", "learning_outcome": "Student selects and wears appropriate protective gear.", "assessment_criteria": ["Helmet checked and fitted", "Protective jacket worn", "Gloves worn", "Boots appropriate", "Hi-vis where needed"], "display_order": 1},
    {"code": "MC002", "name": "Motorcycle Controls", "category": "Motorcycle", "difficulty": "beginner", "description": "Identifies and operates motorcycle controls.", "learning_outcome": "Student identifies and uses all motorcycle controls.", "assessment_criteria": ["Throttle identified", "Front and rear brake identified", "Clutch lever identified", "Indicator and horn identified", "Gears operated correctly"], "display_order": 2},
    {"code": "MC003", "name": "Balance at Low Speed", "category": "Motorcycle", "difficulty": "beginner", "description": "Maintains balance during slow manoeuvres.", "learning_outcome": "Student maintains balance at walking speed.", "assessment_criteria": ["Upright at very slow speed", "Steering corrections minimal", "No foot down (if experienced)", "Clutch control aiding balance"], "display_order": 3},
    {"code": "MC004", "name": "Clutch & Throttle Coordination", "category": "Motorcycle", "difficulty": "beginner", "description": "Coordinates clutch and throttle smoothly.", "learning_outcome": "Student coordinates clutch and throttle smoothly.", "assessment_criteria": ["Smooth power delivery", "No stalling", "No jerky acceleration", "Low-speed control maintained"], "display_order": 4},
    {"code": "MC005", "name": "Counter Steering", "category": "Motorcycle", "difficulty": "intermediate", "description": "Uses counter steering correctly at speed.", "learning_outcome": "Student uses counter steering for higher-speed manoeuvres.", "assessment_criteria": ["Steers left by pushing left handlebar", "Steers right by pushing right handlebar", "Smooth lane changes", "Confident at speed"], "display_order": 5},
    {"code": "MC006", "name": "Figure Eight Riding", "category": "Motorcycle", "difficulty": "intermediate", "description": "Completes controlled figure-eight manoeuvres.", "learning_outcome": "Student completes figure-eight manoeuvres with control.", "assessment_criteria": ["Smooth path followed", "Speed maintained", "Balance throughout", "Observations completed"], "display_order": 6},
    {"code": "MC007", "name": "Emergency Braking (Motorcycle)", "category": "Motorcycle", "difficulty": "advanced", "description": "Performs emergency stop on a motorcycle.", "learning_outcome": "Student performs emergency stop safely on motorcycle.", "assessment_criteria": ["Both brakes applied progressively", "Clutch pulled in", "Steering maintained", "Stop achieved safely", "Post-stop balance maintained"], "display_order": 7},
    {"code": "MC008", "name": "Cornering Technique (Motorcycle)", "category": "Motorcycle", "difficulty": "intermediate", "description": "Negotiates bends safely on a motorcycle.", "learning_outcome": "Student negotiates bends safely on motorcycle.", "assessment_criteria": ["Speed reduced before bend", "Correct gear selected", "Leaning appropriate for speed", "Acceleration smooth out of bend"], "display_order": 8},
    {"code": "MC009", "name": "Traffic Riding (Motorcycle)", "category": "Motorcycle", "difficulty": "intermediate", "description": "Rides safely in mixed traffic.", "learning_outcome": "Student rides safely in mixed traffic conditions.", "assessment_criteria": ["Road position defensive", "Aware of vehicle blind spots", "Speed appropriate", "Lane discipline maintained"], "display_order": 9},
    {"code": "MC010", "name": "Motorcycle Test Readiness", "category": "Motorcycle", "difficulty": "advanced", "description": "Demonstrates readiness for the riding test.", "learning_outcome": "Student demonstrates all competencies for motorcycle test.", "assessment_criteria": ["All basic manoeuvres competent", "Traffic riding safe and confident", "Emergency procedures understood", "Independent riding demonstrated"], "display_order": 10},
]

# Prerequisites mapping (code -> list of prerequisite codes)
PREREQUISITES = {
    "MT004": ["MT002"],
    "MT005": ["MT004"],
    "MT006": ["MT005"],
    "MT007": ["MT006"],
    "MT008": ["MT002", "MT003"],
    "SC003": ["SC001"],
    "SC006": ["SC004"],
    "SC007": ["SC005"],
    "JN003": ["JN002"],
    "JN004": ["JN001", "JN002"],
    "JN007": ["JN001"],
    "RB002": ["RB001"],
    "RB003": ["RB002"],
    "RB004": ["RB002"],
    "RB006": ["RB003"],
    "PK004": ["PK001"],
    "PK006": ["PK002", "PK003"],
    "TM004": ["TM003"],
    "TM007": ["TM008"],
    "RT004": ["RT002"],
    "RT005": ["RT004"],
    "RT006": ["RT005"],
    "RT008": ["RT007"],
    "DD002": ["DD001"],
    "DD003": ["DD002"],
    "DD004": ["DD003"],
    "DD005": ["DD004"],
    "TR003": ["TR001"],
    "TR006": ["TR003"],
    "TR007": ["TR006"],
    "TR008": ["TR007"],
    "MC004": ["MC002", "MC003"],
    "MC005": ["MC004"],
    "MC006": ["MC004"],
    "MC007": ["MC004", "MC005"],
    "MC008": ["MC005"],
    "MC010": ["MC007", "MC008", "MC009"],
}


async def seed():
    async with async_session() as db:
        result = await db.execute(select(Company))
        companies = list(result.scalars().all())

        if not companies:
            print("No companies found. Creating catalogue for default company.")
            default_company_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
            companies = [type('Company', (), {'id': default_company_id})()]

        for company in companies:
            company_id = company.id
            print(f"\nSeeding competency catalogue for company {company_id}...")

            # Check if already seeded
            existing = await db.execute(
                select(CompetencyVersion).where(CompetencyVersion.company_id == company_id)
            )
            if existing.scalars().first():
                print(f"  Catalogue already exists for company {company_id}, skipping.")
                continue

            # Create version
            version = CompetencyVersion(
                company_id=company_id,
                version="1.0",
                name="Competency Catalogue v1.0",
                description="Standard driving school competency framework covering 13 domains and 102 competencies.",
                status=CompetencyVersionStatus.ACTIVE,
                created_by_phone="0782832711",
            )
            db.add(version)
            await db.flush()

            # Create categories
            cat_map = {}
            for cat_data in CATEGORIES:
                cat = CompetencyCategory(
                    company_id=company_id,
                    name=cat_data["name"],
                    description=cat_data["description"],
                    display_order=cat_data["display_order"],
                )
                db.add(cat)
                await db.flush()
                cat_map[cat_data["name"]] = cat

            # Create competencies
            comp_map = {}
            for comp_data in COMPETENCIES:
                comp = Competency(
                    company_id=company_id,
                    version_id=version.id,
                    category_id=cat_map[comp_data["category"]].id,
                    code=comp_data["code"],
                    name=comp_data["name"],
                    description=comp_data["description"],
                    learning_outcome=comp_data.get("learning_outcome"),
                    assessment_criteria=comp_data.get("assessment_criteria", []),
                    difficulty=CompetencyDifficulty(comp_data["difficulty"]),
                    training_category=CompetencyTrainingCategory.DRIVING,
                    display_order=comp_data["display_order"],
                    created_by_phone="0782832711",
                )
                db.add(comp)
                await db.flush()
                comp_map[comp_data["code"]] = comp

            # Create prerequisites
            for comp_code, prereq_codes in PREREQUISITES.items():
                if comp_code in comp_map:
                    for prereq_code in prereq_codes:
                        if prereq_code in comp_map:
                            prereq = CompetencyPrerequisite(
                                competency_id=comp_map[comp_code].id,
                                prerequisite_id=comp_map[prereq_code].id,
                            )
                            db.add(prereq)

            await db.commit()
            print(f"  Seeded: 1 version, {len(CATEGORIES)} categories, {len(COMPETENCIES)} competencies, {sum(len(v) for v in PREREQUISITES.values())} prerequisites")

        print("\nDone!")


if __name__ == "__main__":
    asyncio.run(seed())
