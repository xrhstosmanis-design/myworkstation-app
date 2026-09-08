# Super Admin inspection: διόρθωση store scope

Η δημόσια, προσωρινή διαδρομή inspection έχει μορφή `/api/operators/inspection/:storeId` και ελέγχεται στη συνέχεια με υπογεγραμμένο token δεκάλεπτης ισχύος.

Ο module guard αναγνωρίζει πλέον αυτό το route shape ώστε να εντοπίζει το συγκεκριμένο κατάστημα πριν περάσει στο token validation. Δεν επιτρέπεται πρόσβαση χωρίς έγκυρο token και η οθόνη παραμένει μόνο ανάγνωσης.
