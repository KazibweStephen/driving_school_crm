I need to learn fullstack web development with python/fastapi, angular/tailwind through building a fa fullstack mobile first crm application that manages business operations with particular focus on driving school as a business.You figure out the best way to learn faster and master to senior level developer, that can be by sharing code step by step. I currently develop with java and I have some knowledge of python but it has been hard to hit mastery.This appplication is to be used in production on actual business operations, so should be production ready at every step, as we build and add more features.

Below are some of the operations:
0- Auth and user management:
  a- Allow admin creation of users(with no self registration).  
  b- Auth should be via phone number for all users and a 4 digit password
  c- Users can reset password where the system can send an OPT to the users phone number or whatsapp unless the user is temporarily blocked or deactivated.
  d- We can send sms through Pahappa, Twilio, or Africa is talking. This functionality can be implemented though an adapter class that accept a vendor integration, which can initially be logging.
  c- We have different types of users.
    - Office Admins
      - Can Manage new Clients and their consultations on products and follow ups per product package
      - Convert Client Consultations to Paying Clients
      - Manage Client training schedules
      - Accept Client Payments
      - Manage Client Profiles and documents(some documents can mature and also expire)
      - Manage Branch Daily Expenses( including fuel)
    - Instructors
     - Can Add new consultations and and manage follow ups
     - Can Request for Fuel, with submission of Current Mileage and accompaning photo.
     - Comfirm client training
    - Branch Supervisors
      - Can manage all branch operations
    - Super Users
     - Can manage all system operations for the company


1-Should allow creation, updating, deleting of driving school products where each product can have 1 or more packages that have a price, optional duration. Examples may include
    a-Product: Driving and permit processing(Class B).
      Duration: 1 and a half Months
      Packages:
        i- Driving and 5 Years Permit, Price: 830,000
        ii- Driving and 3 Yeares Permit, Price: 730,000
        iii- Driving and 1 Years Permit, Price: 630,000
    b-Product: Driving Only(No Permit Processing).
      Duration: Variable
      Packages:
        i- 1 Month Driving , Price: 380,000
        ii- 3 Weeks Driving , Price: 285,000
        iii- 2 Weeks Driving , Price: 190,000
        iv- 1 Week Driving , Price: 95,000
        v- 1 Day Driving , Price: 30,000

    c-Product:  Permit Processing(Class B - No Driving Lessions).
      Duration: 1 and a half Months
      Packages:
        i- 5 Years Permit, Price: 580,000
        ii- 3 Yeares Permit, Price: 430,000
        iii- 1 Years Permit, Price: 330,000
    (Each product can also have expirable promotional discounts)

    d-Product:  Defensive Driving Certification
      Duration: 2 days
      Packages:
      i- Defensive Driving, Price: 250,000

2- Should allow creation, updating, deleting of Client Consultations:
 - When a client visits to consult about our products, they can give 
    - thier phone number(used for identification or searching), 
    - name(s) also used for identification or searching, 
    - location, 
    - Products and package they are inquiring about, 
    - how they got to know about us(Sign Post, Barner, Car, TikTok, Recomendation), 
    - when they are willing to start(or if no particular date, the user can capture notes on when to follow up), 
  the user can add the level interest(Very high, High, Medium, Undecided, Low).
 - A client can be in 
        - a consulting stage, new status if they have no active product package(a package can be active if it has a payment whether installment or full from the client, unless it is flagged as completed for which the client be in completed status)
        - A client can be converted stage, new status if they have made a payment on any of the packages and its their first time buying a pacakage.
        - A client can be converted stage, upsold status if they have made a payment on more than one of the packages.
        - A client can be in lost stage if, they have one packages consulted on, yet the user has flagged as lost with a reason why
        - A client can be in converted stage, completed status if they have completed the program successfully


 - When a client chooses to make a first installment payment or full payment, the status changes from consulting to converted, new status
 - Saving a consultation should route to the Payments page, the user can choose to change the product and package the client is paying for.
 - When the user give the number (which should be the first thing to enter in the system), the system should perform a search, to check if the user exists, if they do, they system should present their consultations a clickable drop down with usable client information that the user can click to open the clients page that should include client details, previous consultations and conversions, and allows to add a consultation, or convert any of the unconverted consultations. If no client exists, the user can be presented with a button on the left of the drop down to create a new record.
 - Each consultation should have all the information about the client transactions, Payments and balances for each payment made on a package, followups, trainings and training balances, learners permit maturity date if a learners permit details were submited.
 - the user can filter between converted, consulted and training on the consultations list.
 - the user can add follow ups to the package(s) when they follow up with the clients that includes, a note, next follow up date and time, and a status(promissing, lost interest, lost, needs convincing, needs discount).
 - the user can add payments to each package. Adding the first payment

 
3- Manage client payments
 - A user can add a client payment after they search by name or phone number and landing on a clients profile, and clicking on adding a payment to a package or set of packages. A clients profile can be the consultations page for this client that has all the information, payments, trainings, followups etc as detailed above.
 - The payments page has to show the total the client has to pay( for the selected packages), the total balance for the selected packages, and allow the user to input the amount the client has tendered, and the amount he is paying, the balance to give the client. For each package the user can aportion how much of the amount paid to each package selected.
 - A receipt should be presentedas it would look on a thermal printer(80mm) with contols to print.
 - A receipt link can also be sent via text message or whatsapp with a thank you note.
 - The user should not when the next payment will be made on the system.

4- Tracks Employee conversions.
We have two types of employees(Office Admins that handles clients transactions, office conversations, training schedules and other office work like checking learners permits about to matur or expire and Instructors that train, but can also refer clients). 
- Each of these is entiled to a sales bonus as below.
 - if a clients walks in by themselves, and converted, then the admin is given a preconfigured commission as per package.
 - if a client is brought in by the instructor and converted, then they share the commision.
- The system shoud show the user on their dashboard, how much is expected from commissions and number of clients he has converted that month.
- The system should only award bonus as a percentage of the amount paid out the total expected. For example if 10,000 was configured to be given for a package costing 630,000 and the client has only paid 300,000, then (300,000/630,000)x10,000 should be shown as earned, showing the balance should the client clear their balance in the month.
- They system should also show the set monthly client target versus achieved.


5- Track Client trainings.
 A client trains for a pre-configured duration per session say 30mins, with practical driving lessions happening only during week days, and theory lessions happening on Saturdays on a set time. The system should enable sales agents to see their assigned schedules and lessions already taken, update lessions before they are taken by the client

6- Manage branch expenses, per category, including Rent, etc
7- Manage Fuel Expenses per car:
 The system should allow Driving Instructors to submit requests for fuel, that can be approved with submitting the current mileage and picture of the odometer. The system should determing if that car is due for refueling by computing the number of clients trained since last fueling and mileage by looking at the fuel-training-session rating value for that car

8- Does daily balancing for each branch(New Cash Sales, Cash From Collections, Expenses, Consultations, Balance Due, Amounts Expected Due the next day etc).

9- Manage Customer Information, Bio Data, Copies of the National ID, Pictures of their learners Permits(Including when they received it, When it expires), Date when they received their permit if they get it, Date when expected to do a pre-test, a final test, and when expecing to receive the permit. This can have a customer facing panel to show the lineage to help manage expectations, and backoffice facing to update and manage, alert on approaching due dates, payments, testing, balances.



10- The user interface should be modern and slick, and shuold facilitate very easy use on mobile devices.


11- Allow clients to take pretest exams:
The pretest can be set, its duration can be set, we shall have a section to build that manages all the tests. It does not last 3 days, but can be taken any time during the training, the last one can be in the 3rd last day of the training. Much as the training takes 30days for a a product with a 1 Month Duration, the Driving days are only in the weekly days, unless one adds an extra fee to drive over the weekends. After the pre-test the client can be booked for  final test, that can happen on any date if confirmed. After the final test the client can wait for a set time to get thier permit. So we can have global defaults but can be configured per product. Note that some products the client does not need training forexample the Permit Only Product. Some other they dont need a permit for example the Driving Only Product, Defensive Driving Certificate only needs a a 2 day training and  ceriticate, Their are Products Like renewals(3years, 1year, 5years), Lapsed permit that also dont need training.