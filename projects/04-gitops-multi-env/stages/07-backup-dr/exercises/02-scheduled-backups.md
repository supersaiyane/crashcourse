# Exercise 2: Scheduled Backups

1. Create a Velero Schedule: daily at 02:00 UTC, retain 7 days
2. Verify the schedule: `velero schedule describe daily-backup`
3. Wait for the first scheduled backup to run (or trigger manually)
4. List all backups: `velero backup get`
5. Set a TTL of 168h (7 days) and verify old backups are cleaned up
