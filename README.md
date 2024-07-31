<!--
# README.md
# cmdada/adabitstatus
-->
adabitstatus
=================
<a href="https://oql.avris.it/license/v1.1" target="_blank" rel="noopener"><img src="https://badgers.space/badge/License/OQL/pink" alt="License: OQL" style="vertical-align: middle;"/></a>

What is this?
--------------------------
adabitstatus is a homemade status page for all of my microservices written in nodejs, if you want to run it yourself just like... credit me on the page please. (also to change what sites you're monitoring install [gum](https://github.com/charmbracelet/gum) and run ```./configure.sh```)

Install via Docker
--------------------------
run ```docker pull ghcr.io/cmdada/adabitstatus:main && docker run -n status -p 3001:3001 ghcr.io/cmdada/adabitstatus:main ```
and to configure ```docker exec -it status ./configure.sh```
![image](https://github.com/user-attachments/assets/daaa4307-26d9-41af-ad93-a7b46ca97b44)
