from django.db import models

class Student(models.Model):
    email = models.EmailField(unique=True)
    course = models.CharField(max_length=100)
    name = models.CharField(max_length=100)

def write_student(email, course, name):
    student = Student(email=email, course=course, name=name)
    student.save()
    return student
    class StudentCreateView(View):
        def post(self, request, *args, **kwargs):
            data = json.loads(request.body)
            email = data.get('email')
            course = data.get('course')
            name = data.get('name')
            if not all([email, course, name]):
                return JsonResponse({'error': 'Missing fields'}, status=400)
            try:
                student = write_student(email, course, name)
                return JsonResponse({'id': student.id, 'email': student.email, 'course': student.course, 'name': student.name}, status=201)
            except Exception as e:
                return JsonResponse({'error': str(e)}, status=400)
            
        