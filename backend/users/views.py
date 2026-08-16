from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from .permissions import IsAdmin
from .serializers import (
    ChangePasswordSerializer,
    FaasTokenObtainPairSerializer,
    UserSerializer,
    UserWriteSerializer,
)

User = get_user_model()


class FaasTokenObtainPairView(TokenObtainPairView):
    """POST /api/auth/login/ - returns access + refresh tokens and the profile."""

    serializer_class = FaasTokenObtainPairSerializer


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    filterset_fields = ("role", "is_active")
    search_fields = ("username", "first_name", "last_name", "email")
    ordering_fields = ("username", "first_name", "last_name", "role")

    def get_permissions(self):
        if self.action in {"me", "change_password"}:
            return [IsAuthenticated()]
        return [IsAdmin()]

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return UserWriteSerializer
        return UserSerializer

    @extend_schema(responses=UserSerializer)
    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        """Profile of the caller, including the rooms they are responsible for."""
        return Response(UserSerializer(request.user).data)

    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    @action(detail=False, methods=["post"], url_path="change-password")
    def change_password(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
