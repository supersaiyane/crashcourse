# Exercise 1: Run Your First Container

**Goal:** Run your first Docker container and understand the basic lifecycle.

## Step 1: Hello, World

```bash
docker run hello-world
```

Behind the scenes:
1. Docker checked if the `hello-world` image existed locally
2. It didn't, so Docker pulled it from Docker Hub
3. Docker created a container from that image
4. The container ran, printed its message, and exited

## Step 2: Interactive Ubuntu

```bash
docker run -it ubuntu:22.04 bash
```

Inside the container, explore:

```bash
ls /
cat /etc/os-release
ps aux
hostname
```

Type `exit` or Ctrl+D to leave.

## Step 3: List and Clean Up

```bash
docker ps
docker ps -a
docker images
docker rm <container-id>
```

To auto-remove containers on exit, use `--rm`:

```bash
docker run --rm -it ubuntu:22.04 bash
```
