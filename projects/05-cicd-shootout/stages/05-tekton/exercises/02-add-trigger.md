# Exercise 2: Add a Tekton Trigger

1. Install Tekton Triggers
2. Create an EventListener that watches for GitHub webhook push events
3. Create a TriggerTemplate that starts the pipelineapi-ci Pipeline
4. Expose the EventListener as a Service
5. Configure a GitHub webhook pointing to the EventListener URL
6. Push a commit and verify the pipeline starts automatically
