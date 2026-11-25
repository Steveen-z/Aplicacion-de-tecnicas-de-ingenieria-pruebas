# Flujo de trabajo en equipo (Git)

Para evidenciar el trabajo del equipo, cada integrante debe trabajar con **su propia cuenta** y:

1. Crear un Issue por tarea (plantillas en `.github/ISSUE_TEMPLATE`), p. ej. "P06 – Actualizar precio".
2. Crear una rama desde `main`: `feature/p06-precio`, `fix/login-error`, `docs/iso25010`.
3. Commits pequeños (convención: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
4. Abrir un Pull Request que referencie el Issue (`Closes #12`), pedir revisión a un compañero y hacer merge a `main`.
5. La versión final se marca con una etiqueta: `git tag -a v1.0.0 -m "Versión final" && git push --tags`.

Ramas sugeridas: `main` (estable), `develop` (integración, opcional) y una rama por tarea.
